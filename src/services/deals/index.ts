/** Deals module: status flow, payment terms, posts, reminders and summaries (FR-9, UC-R4 to UC-R6). */
import type {
  DealChanges,
  DealEventKind,
  DealEventRecord,
  DealRecord,
  DealSummary,
} from '@/adapters/db/deal-repository';
import type { Repositories } from '@/adapters/db/repositories';
import type { RequestRecord } from '@/adapters/db/request-repository';
import { type SocialPlatform, SocialProviderError } from '@/adapters/social/provider';
import { COLLABORATION_PAGE_SIZE, DEAL_LIMITS, POST_STATS_REFRESH } from '@/config/collaboration';
import type { CollabSide } from '@/domain/chat';
import {
  allowedDealActions,
  type DealAction,
  isActionForSide,
  isDeadlineReminderDue,
  isPaymentReminderDue,
  nextDealStatus,
  paymentDueAt,
  splitPayment,
} from '@/domain/deals';
import { invalidState, notAllowed, notFound, validationFailed } from '@/domain/errors';
import { getLogger } from '@/lib/logger';
import type { ServiceContext } from '../context';
import { requestEmailDispatch } from '../email';
import {
  brandContactIds,
  type NotificationEmail,
  notifyUsers,
  type Recipient,
} from '../notifications';
import { recordSecurityEvent } from '../security';
import { fetchPostStatsFor, findCreatorPost } from '../social';

export type { DealEventRecord, DealPostRecord, DealSummary } from '@/adapters/db/deal-repository';

const PAISE_PER_RUPEE = 100;
const DAY_MS = 86_400_000;
const logger = getLogger('deals');
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

/**
 * The deal and the user's side: the creator, or any member of the brand's team. Anyone
 * else gets "not found", and the attempt is logged (SR-5, SEC-2).
 */
export async function requireDealParticipant(
  repos: Repositories,
  userId: string,
  dealId: string,
): Promise<{ deal: DealRecord; side: CollabSide }> {
  const deal = await repos.deals.findById(dealId);
  if (deal?.creatorUserId === userId) return { deal, side: 'CREATOR' };
  if (deal) {
    const membership = await repos.brands.findMembership(userId);
    if (membership?.brandId === deal.brandId) return { deal, side: 'BRAND' };
  }
  await recordSecurityEvent(repos, {
    action: 'access.denied',
    actorUserId: userId,
    metadata: { resource: 'deal' },
  });
  throw notFound();
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
}

/** FR-9.1: one deal with its history and what the viewer can do next. */
export async function getDeal(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string },
): Promise<DealView> {
  const { deal, side } = await requireDealParticipant(ctx.repos, input.userId, input.dealId);
  return {
    ...deal,
    viewerSide: side,
    otherPartyName: side === 'BRAND' ? deal.creatorDisplayName : deal.brandName,
    allowedActions: allowedDealActions(deal.status, side),
    events: await ctx.repos.deals.listEvents(deal.id),
    payment:
      deal.agreedAmountMinor === null
        ? null
        : splitPayment(deal.agreedAmountMinor, deal.advancePercent),
    paymentDueAt: paymentDueAt(deal, DEAL_LIMITS.paymentGraceDays),
    chatId: await ctx.repos.chat.findThreadIdForRequest(deal.requestId),
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

/** The people on the other side of a deal who should hear about a change. */
async function otherSideContacts(
  repos: Repositories,
  deal: DealRecord,
  side: CollabSide,
): Promise<string[]> {
  return side === 'BRAND'
    ? [deal.creatorUserId]
    : brandContactIds(repos, deal.brandId, deal.sentByUserId);
}

interface ActionOutcome {
  readonly changes?: DealChanges;
  readonly event: { readonly kind: DealEventKind; readonly note?: string | null };
  /** Extra work in the same transaction (reports, emails). */
  readonly alsoDo?: (repos: Repositories) => Promise<void>;
}

/**
 * Runs one deal action: checks the side and the order (UC-R4: out-of-order updates are
 * rejected), then changes the status only if nobody changed it meanwhile, and records the
 * event, all in one transaction.
 */
async function performAction(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string },
  action: DealAction,
  decide: (deal: DealRecord, side: CollabSide, now: Date) => ActionOutcome | Promise<ActionOutcome>,
): Promise<void> {
  const now = ctx.clock.now();
  const { deal, side } = await requireDealParticipant(ctx.repos, input.userId, input.dealId);
  if (!isActionForSide(action, side)) throw notAllowed();
  const next = nextDealStatus(deal.status, action, side);
  if (!next) throw invalidState();
  const outcome = await decide(deal, side, now);
  await ctx.transaction(async (repos) => {
    if (!(await repos.deals.transition(deal.id, deal.status, next, outcome.changes))) {
      throw invalidState();
    }
    await repos.deals.addEvent({
      dealId: deal.id,
      kind: outcome.event.kind,
      actorUserId: input.userId,
      actorSide: side,
      note: outcome.event.note ?? null,
      createdAt: now,
    });
    await outcome.alsoDo?.(repos);
  });
  await requestEmailDispatch(ctx.jobQueue);
  logger.info({ action: `deal.${action.toLowerCase()}`, dealId: deal.id }, 'deal updated');
}

/** Emails the other side about a deal change. */
function notifyOtherSide(
  ctx: ServiceContext,
  deal: DealRecord,
  side: CollabSide,
  email: (recipient: Recipient) => NotificationEmail,
) {
  return async (repos: Repositories) => {
    await notifyUsers(repos, ctx.appUrl, {
      now: ctx.clock.now(),
      userIds: await otherSideContacts(repos, deal, side),
      path: `/deals/${deal.id}`,
      email,
    });
  };
}

export interface DealTermsInput {
  readonly agreedAmountRupees: number | null;
  readonly advancePercent: number | null;
  /** "YYYY-MM-DD" or null. */
  readonly paymentDueOn: string | null;
}

/** FR-9.2: the brand records the agreed amount and payment terms (until payment is marked). */
export async function updateDealTerms(
  ctx: ServiceContext,
  input: DealTermsInput & { readonly userId: string; readonly dealId: string },
): Promise<void> {
  await performAction(ctx, input, 'UPDATE_TERMS', (deal, side, now) => {
    const paymentDueOn = input.paymentDueOn ? new Date(`${input.paymentDueOn}T00:00:00Z`) : null;
    const today = new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
    if (paymentDueOn && (Number.isNaN(paymentDueOn.getTime()) || paymentDueOn < today)) {
      throw validationFailed({ paymentDueOn: 'deal.invalidDueDate' });
    }
    return {
      changes: {
        agreedAmountMinor:
          input.agreedAmountRupees === null ? null : input.agreedAmountRupees * PAISE_PER_RUPEE,
        advancePercent: input.advancePercent,
        paymentDueOn,
      },
      event: { kind: 'TERMS_UPDATED' },
      alsoDo: notifyOtherSide(ctx, deal, side, (recipient) => ({
        template: 'dealTermsUpdated',
        payload: { ...recipient, brandName: deal.brandName, campaignName: deal.campaignName },
      })),
    };
  });
}

/** FR-9.1: the creator sends the content for the brand to review, with an optional note. */
export async function submitContent(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string; readonly note: string },
): Promise<void> {
  await performAction(ctx, input, 'SUBMIT_CONTENT', (deal, side) => ({
    event: { kind: 'CONTENT_SUBMITTED', note: input.note.trim() || null },
    alsoDo: notifyOtherSide(ctx, deal, side, (recipient) => ({
      template: 'dealContentSubmitted',
      payload: {
        ...recipient,
        creatorName: deal.creatorDisplayName,
        campaignName: deal.campaignName,
      },
    })),
  }));
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
 * are saved now and refreshed daily. The first post moves the deal to "posted".
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
 * UC-R4 / UC-R5: daily job. Past-deadline deals with nothing posted remind both sides
 * once; overdue payments remind the brand every week until marked paid.
 */
export async function sendDealReminders(
  deps: Pick<ServiceContext, 'repos' | 'transaction' | 'clock' | 'jobQueue' | 'appUrl'>,
): Promise<{ deadlineReminders: number; paymentReminders: number }> {
  const now = deps.clock.now();
  const postedBefore = new Date(now.getTime() - DEAL_LIMITS.paymentGraceDays * DAY_MS);
  const deals = await deps.repos.deals.remindableDeals(
    now,
    postedBefore,
    DEAL_LIMITS.remindersPerRun,
  );
  const days = {
    graceDays: DEAL_LIMITS.paymentGraceDays,
    repeatDays: DEAL_LIMITS.paymentReminderRepeatDays,
  };
  let deadlineReminders = 0;
  let paymentReminders = 0;
  for (const deal of deals) {
    if (isDeadlineReminderDue(deal, now)) {
      await deps.transaction(async (repos) => {
        await repos.deals.markReminderSent(deal.id, 'deadlineReminderSentAt', now);
        await repos.deals.addEvent({
          dealId: deal.id,
          kind: 'DEADLINE_REMINDER',
          actorUserId: null,
          actorSide: null,
          createdAt: now,
        });
        await notifyUsers(repos, deps.appUrl, {
          now,
          userIds: [
            deal.creatorUserId,
            ...(await brandContactIds(repos, deal.brandId, deal.sentByUserId)),
          ],
          path: `/deals/${deal.id}`,
          email: (recipient) => ({
            template: 'dealDeadlinePassed',
            payload: { ...recipient, campaignName: deal.campaignName },
          }),
        });
      });
      deadlineReminders += 1;
    } else if (isPaymentReminderDue(deal, now, days)) {
      await deps.transaction(async (repos) => {
        await repos.deals.markReminderSent(deal.id, 'paymentReminderSentAt', now);
        await repos.deals.addEvent({
          dealId: deal.id,
          kind: 'PAYMENT_REMINDER',
          actorUserId: null,
          actorSide: null,
          createdAt: now,
        });
        await notifyUsers(repos, deps.appUrl, {
          now,
          userIds: await brandContactIds(repos, deal.brandId, deal.sentByUserId),
          path: `/deals/${deal.id}`,
          email: (recipient) => ({
            template: 'paymentOverdue',
            payload: {
              ...recipient,
              creatorName: deal.creatorDisplayName,
              campaignName: deal.campaignName,
            },
          }),
        });
      });
      paymentReminders += 1;
    }
  }
  if (deadlineReminders + paymentReminders > 0) await requestEmailDispatch(deps.jobQueue);
  return { deadlineReminders, paymentReminders };
}

/**
 * UC-R6: daily job refreshing post stats for 90 days after posting. Deleted or private
 * posts keep their last stats and are marked; temporary failures retry tomorrow.
 */
export async function refreshDealPosts(
  ctx: ServiceContext,
): Promise<{ refreshed: number; deleted: number; private: number; failed: number }> {
  const now = ctx.clock.now();
  const posts = await ctx.repos.deals.postsDueForRefresh(
    new Date(now.getTime() - POST_STATS_REFRESH.staleAfterMs),
    new Date(now.getTime() - POST_STATS_REFRESH.refreshForDays * DAY_MS),
    POST_STATS_REFRESH.postsPerRun,
  );
  const counts = { refreshed: 0, deleted: 0, private: 0, failed: 0 };
  for (const post of posts) {
    if (!post.socialAccountId) {
      counts.failed += 1;
      continue;
    }
    try {
      const stats = await fetchPostStatsFor(ctx, {
        socialAccountId: post.socialAccountId,
        postId: post.externalPostId,
      });
      if (stats) {
        await ctx.repos.deals.updatePost(post.id, {
          status: 'LIVE',
          ...stats,
          statsFetchedAt: now,
        });
        counts.refreshed += 1;
      } else {
        await ctx.repos.deals.updatePost(post.id, { status: 'DELETED', statsFetchedAt: now });
        counts.deleted += 1;
      }
    } catch (error) {
      if (error instanceof SocialProviderError && error.kind === 'ACCOUNT_PRIVATE') {
        await ctx.repos.deals.updatePost(post.id, { status: 'PRIVATE', statsFetchedAt: now });
        counts.private += 1;
      } else {
        logger.warn({ err: error, postId: post.id }, 'post stats refresh failed');
        counts.failed += 1;
      }
    }
  }
  return counts;
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
