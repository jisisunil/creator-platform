/** Deals module internals: who may act on a deal, and running one action safely (FR-9, UC-R4). */
import type { DealChanges, DealEventKind, DealRecord } from '@/adapters/db/deal-repository';
import type { ContractRecord } from '@/adapters/db/deal-work-repository';
import type { Repositories } from '@/adapters/db/repositories';
import { WORK_REVIEW } from '@/config/collaboration';
import type { CollabSide } from '@/domain/chat';
import {
  type DealAction,
  dealActionBlocker,
  type DealFacts,
  isActionForSide,
  nextDealStatus,
} from '@/domain/deals';
import { invalidState, notAllowed, notFound } from '@/domain/errors';
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

const logger = getLogger('deals');

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

/** The people on the other side of a deal who should hear about a change. */
export async function otherSideContacts(
  repos: Repositories,
  deal: DealRecord,
  side: CollabSide,
): Promise<string[]> {
  return side === 'BRAND'
    ? [deal.creatorUserId]
    : brandContactIds(repos, deal.brandId, deal.sentByUserId);
}

/** ADR-012 / ADR-013: the deal's contract, review and payment so far, for the action rules. */
export async function loadDealFacts(
  repos: Repositories,
  deal: Pick<DealRecord, 'id' | 'creatorId' | 'paymentMethod'>,
): Promise<DealFacts & { readonly contract: ContractRecord | null }> {
  const [contract, changeRequestsUsed, submissionCount, payment, payoutAccount] = await Promise.all(
    [
      repos.dealWork.currentContract(deal.id),
      repos.dealWork.countChangeRequests(deal.id),
      repos.dealWork.countSubmissions(deal.id),
      repos.escrow.findPaymentForDeal(deal.id),
      repos.escrow.findPayoutAccount(deal.creatorId),
    ],
  );
  return {
    contract,
    hasContract: contract !== null,
    contractAcceptedBy: contract?.acceptances.map((acceptance) => acceptance.side) ?? [],
    changeRequestsUsed,
    maxChangeRequests: contract?.terms.maxChangeRequests ?? WORK_REVIEW.maxChangeRequests,
    hasSubmissions: submissionCount > 0,
    paymentMethod: deal.paymentMethod,
    escrowStatus: payment?.status ?? null,
    hasPayoutAccount: payoutAccount !== null,
  };
}

export interface ActionOutcome {
  readonly changes?: DealChanges;
  readonly event: { readonly kind: DealEventKind; readonly note?: string | null };
  /** Extra work in the same transaction (contract versions, reports, emails). */
  readonly alsoDo?: (repos: Repositories) => Promise<void>;
  /** Undoes work done outside the transaction (stored files) when the action fails. */
  readonly cleanUp?: () => Promise<void>;
}

/**
 * Runs one deal action: checks the side, the order (UC-R4: out-of-order updates are
 * rejected) and the contract and review rules (ADR-012), then changes the status only if
 * nobody changed it meanwhile, and records the event, all in one transaction. The rules
 * are checked again after the status update locks the deal row, so two people acting at
 * once (say, a new contract version and a work submission) can't both get through.
 */
export async function performAction(
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
  if (dealActionBlocker(action, side, await loadDealFacts(ctx.repos, deal))) {
    throw invalidState();
  }
  const outcome = await decide(deal, side, now);
  try {
    await ctx.transaction(async (repos) => {
      if (!(await repos.deals.transition(deal.id, deal.status, next, outcome.changes))) {
        throw invalidState();
      }
      if (dealActionBlocker(action, side, await loadDealFacts(repos, deal))) {
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
  } catch (error) {
    await outcome.cleanUp?.();
    throw error;
  }
  await requestEmailDispatch(ctx.jobQueue);
  logger.info({ action: `deal.${action.toLowerCase()}`, dealId: deal.id }, 'deal updated');
}

/** Emails the other side about a deal change. */
export function notifyOtherSide(
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

/** FR-12.1 / FR-10.1: a completed deal asks both sides to rate each other. */
export async function askBothToRate(
  repos: Repositories,
  appUrl: string,
  deal: DealRecord,
  now: Date,
): Promise<void> {
  await notifyUsers(repos, appUrl, {
    now,
    userIds: await brandContactIds(repos, deal.brandId, deal.sentByUserId),
    path: `/deals/${deal.id}`,
    email: (recipient) => ({
      template: 'ratingRequested',
      payload: {
        ...recipient,
        otherPartyName: deal.creatorDisplayName,
        campaignName: deal.campaignName,
      },
    }),
  });
  await notifyUsers(repos, appUrl, {
    now,
    userIds: [deal.creatorUserId],
    path: `/deals/${deal.id}`,
    email: (recipient) => ({
      template: 'ratingRequested',
      payload: { ...recipient, otherPartyName: deal.brandName, campaignName: deal.campaignName },
    }),
  });
}
