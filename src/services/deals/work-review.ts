/** Deals module: proof of work, the brand's review and disputes (ADR-012). */
import { randomBytes } from 'node:crypto';
import type { SubmissionFileRecord } from '@/adapters/db/deal-work-repository';
import { WORK_REVIEW } from '@/config/collaboration';
import { safeFileName } from '@/domain/chat';
import { reviewDueAt } from '@/domain/deals';
import { invalidState, validationFailed } from '@/domain/errors';
import { detectAttachmentType } from '@/domain/file-types';
import { getLogger } from '@/lib/logger';
import type { ServiceContext } from '../context';
import { requestEmailDispatch } from '../email';
import { brandContactIds, notifyUsers } from '../notifications';
import { loadDealFacts, notifyOtherSide, performAction } from './deal-actions';
import { freezeHeldPayment, releaseHeldPayment } from './escrow';

const logger = getLogger('deals');

type UploadedFile = { readonly bytes: Buffer; readonly fileName: string };

/** Checks and stores proof-of-work files (SR-9: type from the bytes, malware scan). */
async function storeProofFiles(
  ctx: ServiceContext,
  files: readonly UploadedFile[],
): Promise<Omit<SubmissionFileRecord, 'id'>[]> {
  if (files.length > WORK_REVIEW.filesMax) throw validationFailed({ files: 'work.tooManyFiles' });
  const totalBytes = files.reduce((sum, file) => sum + file.bytes.length, 0);
  if (totalBytes > WORK_REVIEW.totalBytesMax)
    throw validationFailed({ files: 'work.fileTooLarge' });
  for (const file of files) {
    if (file.bytes.length === 0) throw validationFailed({ files: 'work.fileTooLarge' });
    if (!detectAttachmentType(file.bytes)) throw validationFailed({ files: 'work.fileType' });
  }
  const stored: Omit<SubmissionFileRecord, 'id'>[] = [];
  try {
    for (const file of files) {
      if ((await ctx.malwareScanner.scan(file.bytes)) !== 'CLEAN') {
        logger.warn({ action: 'work.file-rejected' }, 'infected proof-of-work file rejected');
        throw validationFailed({ files: 'work.fileRejected' });
      }
      const contentType = detectAttachmentType(file.bytes);
      if (!contentType) throw validationFailed({ files: 'work.fileType' });
      const storageKey = `proofs/${randomBytes(24).toString('base64url')}`;
      await ctx.fileStorage.put(storageKey, { bytes: file.bytes, contentType });
      stored.push({
        storageKey,
        fileName: safeFileName(file.fileName, WORK_REVIEW.fileNameMax),
        contentType,
        sizeBytes: file.bytes.length,
      });
    }
  } catch (error) {
    for (const file of stored) await ctx.fileStorage.delete(file.storageKey);
    throw error;
  }
  return stored;
}

/**
 * ADR-012: the creator submits proof of work (links and/or screenshots or PDFs, with a
 * note) under the signed contract. The brand has the contract's review period to approve
 * or ask for changes; after that the work is approved automatically.
 */
export async function submitWork(
  ctx: ServiceContext,
  input: {
    readonly userId: string;
    readonly dealId: string;
    readonly note: string;
    readonly links: readonly string[];
    readonly files: readonly UploadedFile[];
  },
): Promise<void> {
  if (input.links.length === 0 && input.files.length === 0) {
    throw validationFailed({ links: 'work.proofRequired' });
  }
  await performAction(ctx, input, 'SUBMIT_WORK', async (deal, side, now) => {
    const { contract } = await loadDealFacts(ctx.repos, deal);
    const reviewDays = contract?.terms.reviewDays ?? WORK_REVIEW.reviewDays;
    const files = await storeProofFiles(ctx, input.files);
    return {
      changes: { reviewDueAt: reviewDueAt(now, reviewDays) },
      event: { kind: 'CONTENT_SUBMITTED', note: input.note.trim() || null },
      alsoDo: async (repos) => {
        await repos.dealWork.addSubmission({
          dealId: deal.id,
          note: input.note.trim(),
          links: input.links,
          files,
          submittedByUserId: input.userId,
          submittedAt: now,
        });
        await notifyOtherSide(ctx, deal, side, (recipient) => ({
          template: 'dealContentSubmitted',
          payload: {
            ...recipient,
            creatorName: deal.creatorDisplayName,
            campaignName: deal.campaignName,
          },
        }))(repos);
      },
      cleanUp: async () => {
        for (const file of files) await ctx.fileStorage.delete(file.storageKey);
      },
    };
  });
}

/** ADR-012: the brand asks for changes, saying what to change (a limited number of times). */
export async function requestChanges(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string; readonly note: string },
): Promise<void> {
  const note = input.note.trim();
  if (!note) throw validationFailed({ note: 'validation.required' });
  await performAction(ctx, input, 'REQUEST_CHANGES', (deal, side, now) => ({
    changes: { reviewDueAt: null },
    event: { kind: 'CHANGES_REQUESTED', note },
    alsoDo: async (repos) => {
      await repos.dealWork.reviewPendingSubmission(deal.id, {
        review: 'CHANGES_REQUESTED',
        reviewNote: note,
        reviewedByUserId: input.userId,
        reviewedAt: now,
      });
      await notifyOtherSide(ctx, deal, side, (recipient) => ({
        template: 'workChangesRequested',
        payload: { ...recipient, brandName: deal.brandName, campaignName: deal.campaignName },
      }))(repos);
    },
  }));
}

/** ADR-012 / UC-R5: the brand approves the work; payment falls due. */
export async function approveWork(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string },
): Promise<void> {
  await performAction(ctx, input, 'APPROVE_WORK', (deal, side, now) => ({
    changes: { approvedAt: now, reviewDueAt: null },
    event: { kind: 'WORK_APPROVED' },
    alsoDo: async (repos) => {
      await repos.dealWork.reviewPendingSubmission(deal.id, {
        review: 'APPROVED',
        reviewNote: null,
        reviewedByUserId: input.userId,
        reviewedAt: now,
      });
      await notifyOtherSide(ctx, deal, side, (recipient) => ({
        template: 'workApproved',
        payload: { ...recipient, brandName: deal.brandName, campaignName: deal.campaignName },
      }))(repos);
    },
  }));
  // ADR-013: with escrow, approval pays the creator (and a disputed payment is unfrozen).
  await releaseHeldPayment(ctx, input.dealId);
}

/**
 * ADR-012: either side disagrees about the work under review; it goes to the admin queue
 * as a report. Phase 1 holds no money, so the review period keeps running meanwhile.
 */
export async function raiseDealDispute(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string; readonly note: string },
): Promise<void> {
  const note = input.note.trim();
  if (!note) throw validationFailed({ note: 'validation.required' });
  await performAction(ctx, input, 'RAISE_DISPUTE', (deal, side) => ({
    event: { kind: 'DISPUTE_RAISED', note },
    alsoDo: async (repos) => {
      if (await repos.reports.hasOpenReport(input.userId, 'DEAL', deal.id)) throw invalidState();
      await freezeHeldPayment(repos, deal.id);
      await repos.reports.create({
        reporterUserId: input.userId,
        targetType: 'DEAL',
        targetId: deal.id,
        threadId: await repos.chat.findThreadIdForRequest(deal.requestId),
        reason: note,
      });
      await notifyOtherSide(ctx, deal, side, (recipient) => ({
        template: 'dealDisputed',
        payload: {
          ...recipient,
          otherPartyName: side === 'BRAND' ? deal.brandName : deal.creatorDisplayName,
          campaignName: deal.campaignName,
        },
      }))(repos);
    },
  }));
}

/**
 * ADR-012: hourly job. Work whose review period ended without an answer from the brand is
 * approved automatically, so a creator is never left waiting; both sides are told.
 */
export async function autoApproveDueWork(
  deps: Pick<
    ServiceContext,
    'repos' | 'transaction' | 'clock' | 'jobQueue' | 'appUrl' | 'paymentGateway'
  >,
): Promise<{ approved: number }> {
  const now = deps.clock.now();
  const deals = await deps.repos.deals.reviewsDue(now, WORK_REVIEW.autoApprovalsPerRun);
  let approved = 0;
  for (const deal of deals) {
    const isApproved = await deps.transaction(async (repos) => {
      const changes = { approvedAt: now, reviewDueAt: null };
      if (!(await repos.deals.transition(deal.id, 'CONTENT_SUBMITTED', 'APPROVED', changes))) {
        return false;
      }
      await repos.deals.addEvent({
        dealId: deal.id,
        kind: 'WORK_AUTO_APPROVED',
        actorUserId: null,
        actorSide: null,
        createdAt: now,
      });
      await repos.dealWork.reviewPendingSubmission(deal.id, {
        review: 'AUTO_APPROVED',
        reviewNote: null,
        reviewedByUserId: null,
        reviewedAt: now,
      });
      await notifyUsers(repos, deps.appUrl, {
        now,
        userIds: [
          deal.creatorUserId,
          ...(await brandContactIds(repos, deal.brandId, deal.sentByUserId)),
        ],
        path: `/deals/${deal.id}`,
        email: (recipient) => ({
          template: 'workAutoApproved',
          payload: { ...recipient, campaignName: deal.campaignName },
        }),
      });
      return true;
    });
    if (!isApproved) continue;
    approved += 1;
    await releaseHeldPayment(deps, deal.id);
  }
  if (approved > 0) await requestEmailDispatch(deps.jobQueue);
  return { approved };
}
