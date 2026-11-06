/**
 * Deals module: status flow, contracts, proof of work and review, payment, posts, reminders
 * and summaries (FR-9, UC-R4 to UC-R6, ADR-012).
 */
import type { DealEventRecord, DealRecord, DealSummary } from '@/adapters/db/deal-repository';
import type { SubmissionRecord } from '@/adapters/db/deal-work-repository';
import type { Repositories } from '@/adapters/db/repositories';
import type { RequestRecord } from '@/adapters/db/request-repository';
import { type SocialPlatform, SocialProviderError } from '@/adapters/social/provider';
import { COLLABORATION_PAGE_SIZE, DEAL_LIMITS } from '@/config/collaboration';
import type { CollabSide } from '@/domain/chat';
import { type ContractState, contractStateOf } from '@/domain/contracts';
import { allowedDealActions, type DealAction, paymentDueAt, splitPayment } from '@/domain/deals';
import { validationFailed } from '@/domain/errors';
import type { ServiceContext } from '../context';
import { notifyUsers } from '../notifications';
import { findCreatorPost } from '../social';
import {
  loadDealFacts,
  notifyOtherSide,
  otherSideContacts,
  performAction,
  requireDealParticipant,
} from './deal-actions';

export type { DealEventRecord, DealPostRecord, DealSummary } from '@/adapters/db/deal-repository';
export type { SubmissionRecord } from '@/adapters/db/deal-work-repository';
export {
  acceptContract,
  type ContractRecord,
  type ContractView,
  getDealContract,
  issueContract,
  type IssueContractInput,
} from './contract';
export { requireDealParticipant } from './deal-actions';
export { refreshDealPosts, sendDealReminders } from './deal-jobs';
export {
  approveWork,
  autoApproveDueWork,
  raiseDealDispute,
  requestChanges,
  submitWork,
} from './work-review';

/** Shown as the cancellation reason when a deal ends because an account was deleted. */
const ACCOUNT_DELETED_REASON = 'Account deleted';

/** FR-9.1: the deal for an accepted request; call inside the acceptance transaction. */
export async function createDealFromRequest(
  repos: Repositories,
  request: RequestRecord,
  now: Date,
): Promise<string> {
  return repos.deals.create({
    requestId: request.id,
    campaignId: request.campaignId,
    brandId: request.brandId,
    creatorId: request.creatorId,
    agreedAmountMinor: request.budgetMinor,
    currencyCode: request.currencyCode,
    deadline: request.deadline,
    createdAt: now,
  });
}

export interface DealView extends DealRecord {
  readonly viewerSide: CollabSide;
  readonly otherPartyName: string;
  readonly allowedActions: readonly DealAction[];
  readonly events: readonly DealEventRecord[];
  /** FR-9.2: advance and balance, when an amount is agreed. */
  readonly payment: { readonly advanceMinor: number; readonly balanceMinor: number } | null;
  readonly paymentDueAt: Date | null;
  readonly chatId: string | null;
  /** ADR-012: the current contract version and who still has to accept it. */
  readonly contract: {
    readonly state: ContractState;
    readonly version: number | null;
    readonly fingerprint: string | null;
  };
  readonly submissions: readonly SubmissionRecord[];
  readonly changeRequestsLeft: number;
}

/** FR-9.1: one deal with its history and what the viewer can do next. */
export async function getDeal(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string },
): Promise<DealView> {
  const { deal, side } = await requireDealParticipant(ctx.repos, input.userId, input.dealId);
  const facts = await loadDealFacts(ctx.repos, deal.id);
  return {
    ...deal,
    viewerSide: side,
    otherPartyName: side === 'BRAND' ? deal.creatorDisplayName : deal.brandName,
    allowedActions: allowedDealActions(deal.status, side, facts),
    events: await ctx.repos.deals.listEvents(deal.id),
    payment:
      deal.agreedAmountMinor === null
        ? null
        : splitPayment(deal.agreedAmountMinor, deal.advancePercent),
    paymentDueAt: paymentDueAt(deal, DEAL_LIMITS.paymentGraceDays),
    chatId: await ctx.repos.chat.findThreadIdForRequest(deal.requestId),
    contract: {
      state: contractStateOf(facts.hasContract, facts.contractAcceptedBy),
      version: facts.contract?.version ?? null,
      fingerprint: facts.contract?.fingerprint ?? null,
    },
    submissions: await ctx.repos.dealWork.listSubmissions(deal.id),
    changeRequestsLeft: Math.max(0, facts.maxChangeRequests - facts.changeRequestsUsed),
  };
}

export interface DealListPage {
  readonly items: readonly DealSummary[];
  readonly page: number;
  readonly pageCount: number;
}

/** FR-9.1: the brand's or the creator's deals, most recently changed first. */
export async function listDeals(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly page: number },
): Promise<DealListPage> {
  const page = Math.max(1, Math.floor(input.page));
  const membership = await ctx.repos.brands.findMembership(input.userId);
  const creator = membership ? null : await ctx.repos.creators.findByUserId(input.userId);
  const owner = membership
    ? { brandId: membership.brandId }
    : creator
      ? { creatorId: creator.id }
      : null;
  if (!owner) return { items: [], page, pageCount: 1 };
  const result = await ctx.repos.deals.list(owner, {
    offset: (page - 1) * COLLABORATION_PAGE_SIZE,
    limit: COLLABORATION_PAGE_SIZE,
  });
  return {
    items: result.items,
    page,
    pageCount: Math.max(1, Math.ceil(result.total / COLLABORATION_PAGE_SIZE)),
  };
}

/** The platform whose post links match `url`, with the post id. */
function parsePostLink(
  ctx: ServiceContext,
  url: string,
): { platform: SocialPlatform; postId: string } | null {
  for (const [platform, provider] of Object.entries(ctx.socialProviders) as [
    SocialPlatform,
    (typeof ctx.socialProviders)[SocialPlatform],
  ][]) {
    const postId = provider.parsePostUrl(url);
    if (postId) return { platform, postId };
  }
  return null;
}

/**
 * FR-9.3 / UC-R6: the creator adds the link of a published post. It must be a post on one
 * of their own connected accounts (proved by fetching it through that account); its stats
 * are saved now and refreshed daily for the campaign report. It doesn't change the status:
 * the brand's review of the work does (ADR-012).
 */
export async function addPostLink(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string; readonly url: string },
): Promise<void> {
  await performAction(ctx, input, 'ADD_POST', async (deal, side, now) => {
    const link = parsePostLink(ctx, input.url);
    if (!link) throw validationFailed({ url: 'deal.unknownLink' });
    let found;
    try {
      found = await findCreatorPost(ctx, { creatorId: deal.creatorId, ...link });
    } catch (error) {
      if (!(error instanceof SocialProviderError)) throw error;
      throw validationFailed({
        url: error.kind === 'ACCOUNT_PRIVATE' ? 'deal.postPrivate' : 'deal.tryLater',
      });
    }
    if (!found) throw validationFailed({ url: 'deal.notYourPost' });
    const post = found;
    return {
      changes: deal.postedAt ? {} : { postedAt: now },
      event: { kind: 'POST_ADDED', note: input.url },
      alsoDo: async (repos) => {
        const isNew = await repos.deals.addPost({
          dealId: deal.id,
          socialAccountId: post.socialAccountId,
          platform: link.platform,
          url: input.url,
          externalPostId: link.postId,
          ...post.stats,
          statsFetchedAt: now,
        });
        if (!isNew) throw validationFailed({ url: 'deal.alreadyAdded' });
        await notifyOtherSide(ctx, deal, side, (recipient) => ({
          template: 'dealPostAdded',
          payload: {
            ...recipient,
            creatorName: deal.creatorDisplayName,
            campaignName: deal.campaignName,
          },
        }))(repos);
      },
    };
  });
}

/** FR-9.2 / UC-R5: the brand marks the deal paid; the creator is asked to confirm. */
export async function markDealPaid(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string },
): Promise<void> {
  await performAction(ctx, input, 'MARK_PAID', (deal, side, now) => ({
    changes: { paymentMarkedAt: now },
    event: { kind: 'PAYMENT_MARKED' },
    alsoDo: notifyOtherSide(ctx, deal, side, (recipient) => ({
      template: 'paymentMarked',
      payload: { ...recipient, brandName: deal.brandName, campaignName: deal.campaignName },
    })),
  }));
}

/** FR-9.2 / UC-R5: the creator confirms the money arrived, which completes the deal. */
export async function confirmPaymentReceived(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string },
): Promise<void> {
  await performAction(ctx, input, 'CONFIRM_RECEIVED', (deal, side, now) => ({
    changes: { completedAt: now },
    event: { kind: 'PAYMENT_CONFIRMED' },
    // FR-12.1 / FR-10.1: both sides are asked to rate each other.
    alsoDo: async (repos) => {
      await notifyOtherSide(ctx, deal, side, (recipient) => ({
        template: 'ratingRequested',
        payload: {
          ...recipient,
          otherPartyName: deal.creatorDisplayName,
          campaignName: deal.campaignName,
        },
      }))(repos);
      await notifyUsers(repos, ctx.appUrl, {
        now: ctx.clock.now(),
        userIds: [deal.creatorUserId],
        path: `/deals/${deal.id}`,
        email: (recipient) => ({
          template: 'ratingRequested',
          payload: {
            ...recipient,
            otherPartyName: deal.brandName,
            campaignName: deal.campaignName,
          },
        }),
      });
    },
  }));
}

/**
 * UC-R5: the creator says the payment didn't arrive. The deal stays "payment marked" and
 * the disagreement goes to the admin queue as a report.
 */
export async function reportPaymentNotReceived(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string; readonly note: string },
): Promise<void> {
  await performAction(ctx, input, 'REPORT_NOT_RECEIVED', (deal, side) => ({
    event: { kind: 'PAYMENT_DISPUTED', note: input.note.trim() || null },
    alsoDo: async (repos) => {
      await notifyOtherSide(ctx, deal, side, (recipient) => ({
        template: 'paymentDisputed',
        payload: {
          ...recipient,
          creatorName: deal.creatorDisplayName,
          campaignName: deal.campaignName,
        },
      }))(repos);
      if (await repos.reports.hasOpenReport(input.userId, 'PAYMENT', deal.id)) return;
      await repos.reports.create({
        reporterUserId: input.userId,
        targetType: 'PAYMENT',
        targetId: deal.id,
        threadId: await repos.chat.findThreadIdForRequest(deal.requestId),
        reason: input.note.trim() || 'Payment marked as paid but not received.',
      });
    },
  }));
}

/** UC-R4: either side cancels before payment, with a reason the other side sees. */
export async function cancelDeal(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string; readonly reason: string },
): Promise<void> {
  await performAction(ctx, input, 'CANCEL', (deal, side, now) => ({
    changes: { cancelledAt: now, cancelledBySide: side, cancelReason: input.reason.trim() },
    event: { kind: 'CANCELLED', note: input.reason.trim() },
    alsoDo: notifyOtherSide(ctx, deal, side, (recipient) => ({
      template: 'dealCancelled',
      payload: {
        ...recipient,
        otherPartyName: side === 'BRAND' ? deal.brandName : deal.creatorDisplayName,
        campaignName: deal.campaignName,
      },
    })),
  }));
}

/**
 * UC-A5 / PRV-4: when an account closes, its deals that haven't reached payment are
 * cancelled ("account deleted") and the other side is told. Deals already marked paid stay
 * for both sides' records. Call inside the deletion transaction.
 */
export async function cancelDealsForClosedAccount(
  repos: Repositories,
  input: {
    readonly owner: { readonly brandId: string } | { readonly creatorId: string };
    readonly appUrl: string;
    readonly now: Date;
  },
): Promise<number> {
  const side: CollabSide = 'brandId' in input.owner ? 'BRAND' : 'CREATOR';
  const deals = await repos.deals.listCancellable(input.owner);
  for (const deal of deals) {
    const isCancelled = await repos.deals.transition(deal.id, deal.status, 'CANCELLED', {
      cancelledAt: input.now,
      cancelledBySide: side,
      cancelReason: ACCOUNT_DELETED_REASON,
    });
    if (!isCancelled) continue;
    await repos.deals.addEvent({
      dealId: deal.id,
      kind: 'CANCELLED',
      actorUserId: null,
      actorSide: side,
      note: ACCOUNT_DELETED_REASON,
      createdAt: input.now,
    });
    await notifyUsers(repos, input.appUrl, {
      now: input.now,
      userIds: await otherSideContacts(repos, deal, side),
      path: `/deals/${deal.id}`,
      email: (recipient) => ({
        template: 'dealCancelled',
        payload: {
          ...recipient,
          otherPartyName: side === 'BRAND' ? deal.brandName : deal.creatorDisplayName,
          campaignName: deal.campaignName,
        },
      }),
    });
  }
  return deals.length;
}
