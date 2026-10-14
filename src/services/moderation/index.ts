/**
 * Moderation module: the admin queues for reports, authenticity flags and ownership
 * disputes, and chat access with a logged reason (FR-13.1, FR-13.2, UC-M1 to UC-M3, SEC-11).
 * Admin-only functions check the caller first and write every decision to the audit log.
 */
import type { MessageRecord } from '@/adapters/db/chat-repository';
import type {
  DisputeItem,
  FlagItem,
  FlagStatus,
  ReportItem,
  ReportStatus,
} from '@/adapters/db/moderation-repository';
import type { Repositories } from '@/adapters/db/repositories';
import { invalidState, notAllowed, notFound } from '@/domain/errors';
import type { RequestInfo, ServiceContext } from '../context';
import { queueEmail, requestEmailDispatch } from '../email';
import { recomputeCreatorScore } from '../scoring';
import { requireAdmin } from '../security';

export type {
  DisputeItem,
  FlagItem,
  FlagStatus,
  ReportItem,
  ReportStatus,
} from '@/adapters/db/moderation-repository';

const QUEUE_PAGE_SIZE = 25;
const CHAT_ACCESS_MS = 3_600_000;
const CHAT_REVIEW_MESSAGES = 200;
const APPEAL_MAX = 1000;

interface AdminInput {
  readonly adminUserId: string;
  readonly request: RequestInfo;
}

async function audit(
  repos: Repositories,
  input: AdminInput,
  action: string,
  details: {
    readonly subjectUserId?: string | null;
    readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
  } = {},
): Promise<void> {
  await repos.audit.record({
    category: 'ADMIN',
    action,
    actorUserId: input.adminUserId,
    subjectUserId: details.subjectUserId ?? null,
    ipAddress: input.request.ipAddress,
    metadata: details.metadata,
  });
}

function pageOf(page: number) {
  const safePage = Math.max(1, Math.floor(page));
  return { page: safePage, offset: (safePage - 1) * QUEUE_PAGE_SIZE, limit: QUEUE_PAGE_SIZE };
}

function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / QUEUE_PAGE_SIZE));
}

export interface ReportView extends ReportItem {
  /** Who and what the report is about; null when it no longer exists. */
  readonly target: {
    readonly label: string;
    readonly userIds: readonly string[];
    readonly rating?: { readonly isHidden: boolean };
  } | null;
  /** UC-M1 "repeated false reports". */
  readonly reporterHistory: { readonly total: number; readonly dismissed: number } | null;
}

/** UC-M1: reports with a given status, oldest open ones first. */
export async function listReports(
  ctx: ServiceContext,
  input: { readonly adminUserId: string; readonly status: ReportStatus; readonly page: number },
): Promise<{ items: readonly ReportItem[]; page: number; pageCount: number }> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const { page, ...range } = pageOf(input.page);
  const result = await ctx.repos.moderation.listReports(input.status, range);
  return { items: result.items, page, pageCount: pageCount(result.total) };
}

/** UC-M1: one report with its target and the reporter's history. */
export async function getReport(
  ctx: ServiceContext,
  input: { readonly adminUserId: string; readonly reportId: string },
): Promise<ReportView> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const report = await ctx.repos.moderation.findReport(input.reportId);
  if (!report) throw notFound();
  return {
    ...report,
    target: await ctx.repos.moderation.describeTarget(report.targetType, report.targetId),
    reporterHistory: report.reporter
      ? await ctx.repos.moderation.reporterHistory(report.reporter.id)
      : null,
  };
}

/** UC-M1: closes a report as acted on (resolved) or unfounded (dismissed), with a note. */
export async function closeReport(
  ctx: ServiceContext,
  input: AdminInput & {
    readonly reportId: string;
    readonly outcome: 'RESOLVED' | 'DISMISSED';
    readonly note: string;
  },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  await ctx.transaction(async (repos) => {
    const isClosed = await repos.moderation.closeReport(input.reportId, {
      status: input.outcome,
      resolution: input.note,
      handledByUserId: input.adminUserId,
      handledAt: ctx.clock.now(),
    });
    if (!isClosed) throw invalidState();
    await audit(repos, input, `report.${input.outcome.toLowerCase()}`, {
      metadata: { reportId: input.reportId },
    });
  });
}

/** FR-10.3 / UC-M1: hides an unfair rating (or shows it again). */
export async function setRatingHidden(
  ctx: ServiceContext,
  input: AdminInput & { readonly ratingId: string; readonly isHidden: boolean },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  await ctx.transaction(async (repos) => {
    await repos.moderation.setRatingHidden(input.ratingId, input.isHidden);
    await audit(repos, input, input.isHidden ? 'rating.hidden' : 'rating.shown', {
      metadata: { ratingId: input.ratingId },
    });
  });
}

/**
 * UC-M1: warns a user by email with the reason. Always sent: it isn't a notification the
 * user can turn off.
 */
export async function warnUser(
  ctx: ServiceContext,
  input: AdminInput & { readonly userId: string; readonly reason: string },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const user = await ctx.repos.users.findById(input.userId);
  if (!user) throw notFound();
  if (user.role === 'ADMIN') throw notAllowed();
  await ctx.transaction(async (repos) => {
    await queueEmail(repos, {
      userId: user.id,
      toAddress: user.email,
      locale: user.locale,
      template: 'accountWarning',
      payload: { name: user.name, reason: input.reason },
    });
    await audit(repos, input, 'user.warned', {
      subjectUserId: user.id,
      metadata: { reason: input.reason },
    });
  });
  await requestEmailDispatch(ctx.jobQueue);
}

/**
 * SEC-11: an admin opens a chat only with a written reason (usually a report). The access
 * is logged and lasts an hour.
 */
export async function openChatForReview(
  ctx: ServiceContext,
  input: AdminInput & {
    readonly threadId: string;
    readonly reportId: string | null;
    readonly reason: string;
  },
): Promise<string> {
  await requireAdmin(ctx.repos, input.adminUserId);
  if (!(await ctx.repos.chat.findThread(input.threadId))) throw notFound();
  return ctx.transaction(async (repos) => {
    const grantId = await repos.moderation.createChatGrant({
      adminUserId: input.adminUserId,
      threadId: input.threadId,
      reportId: input.reportId,
      reason: input.reason,
      expiresAt: new Date(ctx.clock.now().getTime() + CHAT_ACCESS_MS),
    });
    await audit(repos, input, 'chat.opened', {
      metadata: { threadId: input.threadId, reportId: input.reportId, reason: input.reason },
    });
    return grantId;
  });
}

export interface ChatReview {
  readonly campaignName: string;
  readonly brandName: string;
  readonly creatorDisplayName: string;
  readonly reason: string;
  readonly expiresAt: Date;
  readonly messages: readonly MessageRecord[];
}

/** SEC-11: the chat behind a valid grant of this admin; read only, read receipts untouched. */
export async function getChatForReview(
  ctx: ServiceContext,
  input: { readonly adminUserId: string; readonly grantId: string },
): Promise<ChatReview> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const grant = await ctx.repos.moderation.findChatGrant(input.grantId);
  if (!grant || grant.adminUserId !== input.adminUserId || grant.expiresAt <= ctx.clock.now()) {
    throw notFound();
  }
  const thread = await ctx.repos.chat.findThread(grant.threadId);
  if (!thread) throw notFound();
  const { messages } = await ctx.repos.chat.listMessages(thread.id, {
    limit: CHAT_REVIEW_MESSAGES,
  });
  return {
    campaignName: thread.campaignName,
    brandName: thread.brandName,
    creatorDisplayName: thread.creatorDisplayName,
    reason: grant.reason,
    expiresAt: grant.expiresAt,
    messages,
  };
}

/** UC-M2: authenticity flags to review; appeals first. */
export async function listFlags(
  ctx: ServiceContext,
  input: { readonly adminUserId: string; readonly status: FlagStatus; readonly page: number },
): Promise<{ items: readonly FlagItem[]; page: number; pageCount: number }> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const { page, ...range } = pageOf(input.page);
  const result = await ctx.repos.moderation.listFlags([input.status], range);
  return { items: result.items, page, pageCount: pageCount(result.total) };
}

/**
 * UC-M2: clears a flag (a false alarm: the signal stops counting against the score for 90
 * days) or confirms it as suspicious (it keeps counting; the creator may appeal).
 */
export async function reviewFlag(
  ctx: ServiceContext,
  input: AdminInput & { readonly flagId: string; readonly decision: 'CLEARED' | 'SUSPICIOUS' },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const flag = await ctx.repos.moderation.findFlag(input.flagId);
  if (!flag) throw notFound();
  await ctx.transaction(async (repos) => {
    const isReviewed = await repos.moderation.reviewFlag(flag.id, {
      status: input.decision,
      reviewedByUserId: input.adminUserId,
      reviewedAt: ctx.clock.now(),
    });
    if (!isReviewed) throw invalidState();
    await audit(repos, input, `flag.${input.decision.toLowerCase()}`, {
      subjectUserId: flag.creator.userId,
      metadata: { flagId: flag.id, type: flag.type },
    });
  });
  await recomputeCreatorScore(ctx, flag.creator.id);
}

/** UC-M2: the creator's own open or suspicious flags, shown with their score. */
export async function getOwnFlags(ctx: ServiceContext, userId: string): Promise<FlagItem[]> {
  const profile = await ctx.repos.creators.findByUserId(userId);
  return profile ? ctx.repos.moderation.listFlagsForCreator(profile.id) : [];
}

/** UC-M2: the creator appeals a "suspicious" decision; the flag returns to the admin queue. */
export async function appealFlag(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly flagId: string; readonly appealText: string },
): Promise<void> {
  const profile = await ctx.repos.creators.findByUserId(input.userId);
  if (!profile) throw notAllowed();
  const text = input.appealText.trim().slice(0, APPEAL_MAX);
  const isAppealed = await ctx.repos.moderation.appealFlag(
    input.flagId,
    profile.id,
    text,
    ctx.clock.now(),
  );
  // Someone else's flag, or one that isn't "suspicious": nothing to appeal (SEC-2).
  if (!isAppealed) throw notFound();
}

/** UC-M3: ownership disputes, oldest open ones first. */
export async function listDisputes(
  ctx: ServiceContext,
  input: {
    readonly adminUserId: string;
    readonly status: 'OPEN' | 'RESOLVED';
    readonly page: number;
  },
): Promise<{ items: readonly DisputeItem[]; page: number; pageCount: number }> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const { page, ...range } = pageOf(input.page);
  const result = await ctx.repos.moderation.listDisputes(input.status, range);
  return { items: result.items, page, pageCount: pageCount(result.total) };
}

/**
 * UC-M3: an admin decides who owns a disputed account. Moving it to the claimant removes
 * the old owner's tokens (the claimant reconnects to be verified again), recomputes both
 * scores, and emails both sides. When both proved ownership through the official login,
 * the latest proof (the claimant's) is the suggested outcome.
 */
export async function resolveDispute(
  ctx: ServiceContext,
  input: AdminInput & {
    readonly disputeId: string;
    readonly decision: 'TRANSFER' | 'KEEP';
    readonly note: string;
  },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const dispute = await ctx.repos.moderation.findDispute(input.disputeId);
  if (!dispute) throw notFound();
  const claimantProfile = await ctx.repos.creators.findByUserId(dispute.claimant.userId);
  if (input.decision === 'TRANSFER' && !claimantProfile) throw invalidState();
  const [claimant, owner] = await Promise.all([
    ctx.repos.users.findById(dispute.claimant.userId),
    ctx.repos.users.findById(dispute.account.ownerUserId),
  ]);
  const platform = dispute.account.platform === 'YOUTUBE' ? 'YouTube' : 'Instagram';
  const handle = dispute.account.handle;

  await ctx.transaction(async (repos) => {
    const isResolved = await repos.moderation.resolveDispute(dispute.id, {
      resolution: `${input.decision}: ${input.note}`,
      resolvedByUserId: input.adminUserId,
      resolvedAt: ctx.clock.now(),
    });
    if (!isResolved) throw invalidState();
    const winner = input.decision === 'TRANSFER' ? claimant : null;
    const loser = input.decision === 'TRANSFER' ? owner : claimant;
    if (input.decision === 'TRANSFER' && claimantProfile) {
      await repos.moderation.transferAccount(dispute.account.id, claimantProfile.id);
    }
    if (winner) {
      await queueEmail(repos, {
        userId: winner.id,
        toAddress: winner.email,
        locale: winner.locale,
        template: 'disputeWon',
        payload: {
          name: winner.name,
          platform,
          handle,
          link: new URL(`/${winner.locale}/creator/accounts`, ctx.appUrl).toString(),
        },
      });
    }
    if (loser) {
      await queueEmail(repos, {
        userId: loser.id,
        toAddress: loser.email,
        locale: loser.locale,
        template: 'disputeLost',
        payload: { name: loser.name, platform, handle },
      });
    }
    await audit(repos, input, `dispute.${input.decision.toLowerCase()}`, {
      subjectUserId: dispute.claimant.userId,
      metadata: { disputeId: dispute.id, accountId: dispute.account.id },
    });
  });
  if (input.decision === 'TRANSFER' && claimantProfile) {
    await recomputeCreatorScore(ctx, dispute.account.ownerCreatorId);
    await recomputeCreatorScore(ctx, claimantProfile.id);
  }
  await requestEmailDispatch(ctx.jobQueue);
}
