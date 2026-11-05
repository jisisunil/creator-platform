/** Deals module internals: who may act on a deal, and running one action safely (FR-9, UC-R4). */
import type { DealChanges, DealEventKind, DealRecord } from '@/adapters/db/deal-repository';
import type { Repositories } from '@/adapters/db/repositories';
import type { CollabSide } from '@/domain/chat';
import { type DealAction, isActionForSide, nextDealStatus } from '@/domain/deals';
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

export interface ActionOutcome {
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
