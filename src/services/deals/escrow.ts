/**
 * Deals module: payments held by the gateway until the work is approved (ADR-013). The
 * brand pays the contract amount plus the processing fee; approval (or automatic approval)
 * releases it to the creator's payout account; a cancellation before any work is submitted
 * refunds it; a dispute freezes it until the brand approves or an admin decides.
 */
import type { DealRecord } from '@/adapters/db/deal-repository';
import type { DealPaymentRecord, PayoutAccountRecord } from '@/adapters/db/escrow-repository';
import type { Repositories } from '@/adapters/db/repositories';
import {
  type CheckoutSession,
  type PaymentGateway,
  PaymentGatewayError,
} from '@/adapters/payments/payment-gateway';
import { ESCROW } from '@/config/collaboration';
import { dealActionBlocker } from '@/domain/deals';
import { conflict, invalidState, notAllowed, notFound, validationFailed } from '@/domain/errors';
import { escrowCharge, isEscrowHeld } from '@/domain/escrow';
import { getLogger } from '@/lib/logger';
import type { RequestInfo, ServiceContext } from '../context';
import { requestEmailDispatch } from '../email';
import { brandContactIds, notifyUsers } from '../notifications';
import { recordSecurityEvent, requireAdmin } from '../security';
import { askBothToRate, loadDealFacts, requireDealParticipant } from './deal-actions';

const logger = getLogger('escrow');
const BANK_DIGITS_SHOWN = 4;

type EscrowDeps = Pick<
  ServiceContext,
  'repos' | 'transaction' | 'clock' | 'jobQueue' | 'appUrl' | 'paymentGateway'
>;

export type { DealPaymentRecord, PayoutAccountRecord } from '@/adapters/db/escrow-repository';
export type { CheckoutSession } from '@/adapters/payments/payment-gateway';

function requireGateway(gateway: PaymentGateway | null): PaymentGateway {
  if (!gateway) throw invalidState();
  return gateway;
}

async function requireCreator(repos: Repositories, userId: string) {
  const creator = await repos.creators.findByUserId(userId);
  if (!creator) throw notAllowed();
  return creator;
}

export interface PayoutDetailsInput {
  readonly legalName: string;
  readonly pan: string;
  readonly phone: string;
  readonly accountHolderName: string;
  readonly accountNumber: string;
  readonly ifsc: string;
}

/**
 * ADR-013: sets up the creator's payout account at the gateway. The PAN and bank details
 * are passed straight through and never stored or logged; we keep the gateway's account id
 * and the last 4 digits of the account number, to show which account is used.
 */
export async function setUpPayoutAccount(
  ctx: ServiceContext,
  input: PayoutDetailsInput & { readonly userId: string },
): Promise<void> {
  const gateway = requireGateway(ctx.paymentGateway);
  const creator = await requireCreator(ctx.repos, input.userId);
  if (await ctx.repos.escrow.findPayoutAccount(creator.id)) throw conflict();
  const user = await ctx.repos.users.findById(input.userId);
  if (!user) throw notFound();
  let accountId: string;
  try {
    ({ accountId } = await gateway.createPayoutAccount({
      email: user.email,
      phone: input.phone,
      legalName: input.legalName,
      pan: input.pan,
      accountHolderName: input.accountHolderName,
      accountNumber: input.accountNumber,
      ifsc: input.ifsc,
      reference: creator.id,
    }));
  } catch (error) {
    if (!(error instanceof PaymentGatewayError)) throw error;
    throw validationFailed({
      details: error.kind === 'REJECTED' ? 'payout.rejected' : 'payout.tryLater',
    });
  }
  const now = ctx.clock.now();
  await ctx.transaction(async (repos) => {
    const isNew = await repos.escrow.addPayoutAccount({
      creatorId: creator.id,
      gateway: gateway.name,
      gatewayAccountId: accountId,
      bankLast4: input.accountNumber.slice(-BANK_DIGITS_SHOWN),
      createdAt: now,
    });
    if (!isNew) throw conflict();
    await repos.audit.record({
      category: 'DATA',
      action: 'payout.account-created',
      actorUserId: input.userId,
      subjectUserId: input.userId,
    });
  });
}

/** ADR-013: the creator's payout account, if set up, and whether payouts are available. */
export async function getPayoutAccount(
  ctx: ServiceContext,
  userId: string,
): Promise<{ readonly isAvailable: boolean; readonly account: PayoutAccountRecord | null }> {
  const creator = await requireCreator(ctx.repos, userId);
  return {
    isAvailable: ctx.paymentGateway !== null,
    account: await ctx.repos.escrow.findPayoutAccount(creator.id),
  };
}

export interface FundingStart {
  readonly checkout: CheckoutSession;
  readonly amountMinor: number;
  readonly feeMinor: number;
  readonly chargedMinor: number;
  readonly currencyCode: string;
}

/**
 * ADR-013: the brand starts paying the contract amount (plus the processing fee) into
 * escrow. Needs a contract both sides accepted and the creator's payout account.
 */
export async function startEscrowFunding(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string },
): Promise<FundingStart> {
  const gateway = requireGateway(ctx.paymentGateway);
  const { deal, side } = await requireDealParticipant(ctx.repos, input.userId, input.dealId);
  if (side !== 'BRAND') throw notAllowed();
  if (deal.status !== 'ACCEPTED' || deal.agreedAmountMinor === null) throw invalidState();
  if (dealActionBlocker('FUND_ESCROW', side, await loadDealFacts(ctx.repos, deal))) {
    throw invalidState();
  }
  const payout = await ctx.repos.escrow.findPayoutAccount(deal.creatorId);
  if (!payout) throw invalidState();
  const amountMinor = deal.agreedAmountMinor;
  const { feeMinor, chargedMinor } = escrowCharge(amountMinor, ESCROW.feeBasisPoints);
  const checkout = await gateway.createHeldOrder({
    chargedMinor,
    transferMinor: amountMinor,
    currencyCode: deal.currencyCode,
    payoutAccountId: payout.gatewayAccountId,
    receipt: deal.id,
  });
  const isSaved = await ctx.repos.escrow.upsertAwaitingPayment({
    dealId: deal.id,
    gateway: gateway.name,
    orderId: checkout.orderId,
    amountMinor,
    feeMinor,
    currencyCode: deal.currencyCode,
  });
  if (!isSaved) throw invalidState();
  return { checkout, amountMinor, feeMinor, chargedMinor, currencyCode: deal.currencyCode };
}

/**
 * ADR-013: the browser's checkout says the brand paid. Accepted only with the gateway's
 * signature for this deal's order; a forged confirmation is refused and logged.
 */
export async function confirmEscrowFunding(
  ctx: ServiceContext,
  input: {
    readonly userId: string;
    readonly dealId: string;
    readonly orderId: string;
    readonly paymentId: string;
    readonly signature: string;
  },
): Promise<void> {
  const gateway = requireGateway(ctx.paymentGateway);
  const { deal, side } = await requireDealParticipant(ctx.repos, input.userId, input.dealId);
  if (side !== 'BRAND') throw notAllowed();
  const payment = await ctx.repos.escrow.findPaymentByOrder(input.orderId);
  const isGenuine =
    payment?.dealId === deal.id &&
    gateway.isCheckoutSignatureValid({
      orderId: input.orderId,
      paymentId: input.paymentId,
      signature: input.signature,
    });
  if (!isGenuine) {
    await recordSecurityEvent(ctx.repos, {
      action: 'payment.signature-rejected',
      actorUserId: input.userId,
      metadata: { dealId: deal.id },
    });
    throw notAllowed();
  }
  await markFunded(ctx, { orderId: input.orderId, paymentId: input.paymentId });
}

/**
 * ADR-013: a verified gateway webhook reports a captured payment. The same payment may also
 * arrive from the browser's checkout; whichever comes first counts, the other does nothing.
 */
export async function recordCapturedPayment(
  deps: EscrowDeps,
  input: { readonly orderId: string; readonly paymentId: string },
): Promise<void> {
  await markFunded(deps, input);
}

async function markFunded(
  deps: EscrowDeps,
  input: { readonly orderId: string; readonly paymentId: string },
): Promise<void> {
  const payment = await deps.repos.escrow.findPaymentByOrder(input.orderId);
  if (!payment) return;
  const deal = await deps.repos.deals.findById(payment.dealId);
  if (!deal) return;
  const now = deps.clock.now();
  const isNew = await deps.transaction(async (repos) => {
    if (!(await repos.escrow.markFunded(input.orderId, input.paymentId, now))) return false;
    await repos.deals.addEvent({
      dealId: deal.id,
      kind: 'ESCROW_FUNDED',
      actorUserId: null,
      actorSide: 'BRAND',
      createdAt: now,
    });
    await notifyUsers(repos, deps.appUrl, {
      now,
      userIds: [deal.creatorUserId],
      path: `/deals/${deal.id}`,
      email: (recipient) => ({
        template: 'escrowFunded',
        payload: { ...recipient, brandName: deal.brandName, campaignName: deal.campaignName },
      }),
    });
    return true;
  });
  if (!isNew) return;
  await requestEmailDispatch(deps.jobQueue);
  logger.info({ action: 'escrow.funded', dealId: deal.id }, 'payment held');
}

/** ADR-013: a dispute stops automatic release of a held payment. Call inside a transaction. */
export async function freezeHeldPayment(repos: Repositories, dealId: string): Promise<void> {
  const payment = await repos.escrow.findPaymentForDeal(dealId);
  if (payment && isEscrowHeld(payment.status)) await repos.escrow.setFrozen(dealId, true);
}

/**
 * ADR-013: approved work: the held payment goes to the creator and the deal completes.
 * If the gateway is unavailable the release stays pending and the hourly job retries.
 */
export async function releaseHeldPayment(deps: EscrowDeps, dealId: string): Promise<void> {
  const isPending = await deps.repos.escrow.moveStatus(dealId, ['FUNDED'], 'RELEASE_PENDING', {
    isFrozen: false,
  });
  if (!isPending) return;
  const payment = await deps.repos.escrow.findPaymentForDeal(dealId);
  if (payment) await settleRelease(deps, payment);
}

/** ADR-013: a cancelled deal's held payment goes back to the brand (the fee isn't refunded). */
export async function refundHeldPayment(deps: EscrowDeps, dealId: string): Promise<void> {
  const isPending = await deps.repos.escrow.moveStatus(dealId, ['FUNDED'], 'REFUND_PENDING');
  if (!isPending) return;
  const payment = await deps.repos.escrow.findPaymentForDeal(dealId);
  if (payment) await settleRefund(deps, payment);
}

async function recordGatewayFailure(deps: EscrowDeps, dealId: string, error: unknown) {
  if (!(error instanceof PaymentGatewayError)) throw error;
  logger.warn({ action: 'escrow.retry-later', dealId, err: error }, 'gateway call failed');
  await deps.repos.escrow.recordError(dealId, error.message);
}

async function settleRelease(deps: EscrowDeps, payment: DealPaymentRecord): Promise<void> {
  const deal = await deps.repos.deals.findById(payment.dealId);
  if (!deal || !payment.paymentId) return;
  let transferId = payment.transferId;
  try {
    const gateway = requireGateway(deps.paymentGateway);
    transferId ??= await gateway.findHeldTransfer(payment.paymentId);
    if (!transferId) {
      throw new PaymentGatewayError('TRANSIENT', 'held transfer not found yet');
    }
    await gateway.releaseTransfer(transferId);
  } catch (error) {
    await recordGatewayFailure(deps, deal.id, error);
    return;
  }
  const releasedTransferId = transferId;
  const now = deps.clock.now();
  await deps.transaction(async (repos) => {
    const isReleased = await repos.escrow.moveStatus(deal.id, ['RELEASE_PENDING'], 'RELEASED', {
      transferId: releasedTransferId,
      releasedAt: now,
      lastError: null,
    });
    if (!isReleased) return;
    await repos.deals.transition(deal.id, 'APPROVED', 'COMPLETED', {
      paymentMarkedAt: now,
      completedAt: now,
    });
    await repos.deals.addEvent({
      dealId: deal.id,
      kind: 'ESCROW_RELEASED',
      actorUserId: null,
      actorSide: null,
      createdAt: now,
    });
    await notifyUsers(repos, deps.appUrl, {
      now,
      userIds: [deal.creatorUserId],
      path: `/deals/${deal.id}`,
      email: (recipient) => ({
        template: 'escrowReleased',
        payload: { ...recipient, brandName: deal.brandName, campaignName: deal.campaignName },
      }),
    });
    await askBothToRate(repos, deps.appUrl, deal, now);
  });
  await requestEmailDispatch(deps.jobQueue);
  logger.info({ action: 'escrow.released', dealId: deal.id }, 'payment released');
}

async function settleRefund(deps: EscrowDeps, payment: DealPaymentRecord): Promise<void> {
  const deal = await deps.repos.deals.findById(payment.dealId);
  if (!deal || !payment.paymentId) return;
  try {
    await requireGateway(deps.paymentGateway).refundPayment(payment.paymentId, payment.amountMinor);
  } catch (error) {
    await recordGatewayFailure(deps, deal.id, error);
    return;
  }
  const now = deps.clock.now();
  await deps.transaction(async (repos) => {
    const isRefunded = await repos.escrow.moveStatus(deal.id, ['REFUND_PENDING'], 'REFUNDED', {
      refundedAt: now,
      lastError: null,
    });
    if (!isRefunded) return;
    await repos.deals.addEvent({
      dealId: deal.id,
      kind: 'ESCROW_REFUNDED',
      actorUserId: null,
      actorSide: null,
      createdAt: now,
    });
    await notifyUsers(repos, deps.appUrl, {
      now,
      userIds: await brandContactIds(repos, deal.brandId, deal.sentByUserId),
      path: `/deals/${deal.id}`,
      email: (recipient) => ({
        template: 'escrowRefunded',
        payload: { ...recipient, campaignName: deal.campaignName },
      }),
    });
  });
  await requestEmailDispatch(deps.jobQueue);
  logger.info({ action: 'escrow.refunded', dealId: deal.id }, 'payment refunded');
}

/** ADR-013: hourly job retrying releases and refunds the gateway couldn't finish. */
export async function settlePendingEscrow(
  deps: EscrowDeps,
): Promise<{ released: number; refunded: number; stillPending: number }> {
  const pending = await deps.repos.escrow.pendingSettlements(ESCROW.settlementsPerRun);
  for (const payment of pending) {
    if (payment.status === 'RELEASE_PENDING') await settleRelease(deps, payment);
    else await settleRefund(deps, payment);
  }
  const after = await Promise.all(
    pending.map((payment) => deps.repos.escrow.findPaymentForDeal(payment.dealId)),
  );
  return {
    released: after.filter((payment) => payment?.status === 'RELEASED').length,
    refunded: after.filter((payment) => payment?.status === 'REFUNDED').length,
    stillPending: after.filter(
      (payment) => payment?.status === 'RELEASE_PENDING' || payment?.status === 'REFUND_PENDING',
    ).length,
  };
}

/**
 * ADR-013 / UC-M1: an admin decides a disputed escrow deal: release the held payment to the
 * creator (the deal completes) or refund it to the brand (the deal is cancelled). The
 * dispute's report is closed with the reason.
 */
export async function resolveEscrowDispute(
  ctx: ServiceContext,
  input: {
    readonly adminUserId: string;
    readonly request: RequestInfo;
    readonly dealId: string;
    readonly reportId: string;
    readonly outcome: 'RELEASE' | 'REFUND';
    readonly reason: string;
  },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const deal = await ctx.repos.deals.findById(input.dealId);
  const payment = await ctx.repos.escrow.findPaymentForDeal(input.dealId);
  if (!deal || payment?.status !== 'FUNDED') throw invalidState();
  const now = ctx.clock.now();
  await ctx.transaction(async (repos) => {
    const isMoved =
      input.outcome === 'RELEASE'
        ? await moveToApproved(repos, deal, now)
        : await repos.deals.transition(deal.id, deal.status, 'CANCELLED', {
            cancelledAt: now,
            cancelReason: input.reason.trim(),
          });
    if (!isMoved) throw invalidState();
    await repos.moderation.closeReport(input.reportId, {
      status: 'RESOLVED',
      resolution: input.reason.trim(),
      handledByUserId: input.adminUserId,
      handledAt: now,
    });
    await repos.audit.record({
      category: 'ADMIN',
      action: `escrow.${input.outcome.toLowerCase()}`,
      actorUserId: input.adminUserId,
      ipAddress: input.request.ipAddress,
      metadata: { dealId: deal.id, reason: input.reason.trim() },
    });
  });
  if (input.outcome === 'RELEASE') await releaseHeldPayment(ctx, deal.id);
  else await refundHeldPayment(ctx, deal.id);
}

async function moveToApproved(repos: Repositories, deal: DealRecord, now: Date) {
  if (deal.status === 'APPROVED') return true;
  return repos.deals.transition(deal.id, deal.status, 'APPROVED', {
    approvedAt: now,
    reviewDueAt: null,
  });
}

/** ADR-013 / UC-M1: a deal's held payment, for an admin handling its dispute. */
export async function getHeldPaymentForAdmin(
  ctx: ServiceContext,
  input: { readonly adminUserId: string; readonly dealId: string },
): Promise<DealPaymentRecord | null> {
  await requireAdmin(ctx.repos, input.adminUserId);
  return ctx.repos.escrow.findPaymentForDeal(input.dealId);
}
