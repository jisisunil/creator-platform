/**
 * Deal rules: the status flow, the contract and work-review gates, payment terms and
 * reminders, and escrow (FR-9, UC-R4, UC-R5, ADR-012, ADR-013). Pure: no I/O.
 */
import type { CollabSide } from './chat';
import { canCancelFundedDeal, type EscrowStatus, isEscrowHeld, type PaymentMethod } from './escrow';

const DAY_MS = 86_400_000;
const PERCENT = 100;

export type DealStatus =
  | 'ACCEPTED'
  | 'CONTENT_SUBMITTED'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'PAYMENT_MARKED'
  | 'COMPLETED'
  | 'CANCELLED';

/** The order shown on the deal's progress bar (cancelled is shown separately). */
export const DEAL_STEPS: readonly DealStatus[] = [
  'ACCEPTED',
  'CONTENT_SUBMITTED',
  'APPROVED',
  'PAYMENT_MARKED',
  'COMPLETED',
];

/** The progress-bar step for a status: work sent back for changes is with the creator again. */
export function dealStepOf(status: DealStatus): DealStatus {
  return status === 'CHANGES_REQUESTED' ? 'ACCEPTED' : status;
}

export type DealAction =
  | 'ISSUE_CONTRACT'
  | 'ACCEPT_CONTRACT'
  | 'FUND_ESCROW'
  | 'SUBMIT_WORK'
  | 'REQUEST_CHANGES'
  | 'APPROVE_WORK'
  | 'RAISE_DISPUTE'
  | 'ADD_POST'
  | 'MARK_PAID'
  | 'CONFIRM_RECEIVED'
  | 'REPORT_NOT_RECEIVED'
  | 'CANCEL';

interface Transition {
  readonly side: CollabSide | 'EITHER';
  /** Status before → status after. */
  readonly moves: Readonly<Partial<Record<DealStatus, DealStatus>>>;
}

/** While the work is with the creator: the contract (and so the terms) may still change. */
const WITH_CREATOR = ['ACCEPTED', 'CHANGES_REQUESTED'] as const;
const IN_REVIEW = ['CONTENT_SUBMITTED', 'CHANGES_REQUESTED'] as const;
const BEFORE_PAYMENT = ['ACCEPTED', 'CONTENT_SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED'] as const;
const unchanged = (statuses: readonly DealStatus[]) =>
  Object.fromEntries(statuses.map((status) => [status, status]));

/**
 * FR-9.1 / UC-R4 / ADR-012: who may do what in which status. Anything not listed is out of
 * order and rejected. Terms are fixed while work is under review, so what the brand reviews
 * is always covered by a contract both sides accepted.
 */
const TRANSITIONS: Readonly<Record<DealAction, Transition>> = {
  ISSUE_CONTRACT: { side: 'BRAND', moves: unchanged(WITH_CREATOR) },
  ACCEPT_CONTRACT: { side: 'EITHER', moves: unchanged(WITH_CREATOR) },
  FUND_ESCROW: { side: 'BRAND', moves: { ACCEPTED: 'ACCEPTED' } },
  SUBMIT_WORK: {
    side: 'CREATOR',
    moves: { ACCEPTED: 'CONTENT_SUBMITTED', CHANGES_REQUESTED: 'CONTENT_SUBMITTED' },
  },
  REQUEST_CHANGES: { side: 'BRAND', moves: { CONTENT_SUBMITTED: 'CHANGES_REQUESTED' } },
  APPROVE_WORK: { side: 'BRAND', moves: { CONTENT_SUBMITTED: 'APPROVED' } },
  RAISE_DISPUTE: { side: 'EITHER', moves: unchanged(IN_REVIEW) },
  ADD_POST: { side: 'CREATOR', moves: unchanged(BEFORE_PAYMENT) },
  MARK_PAID: { side: 'BRAND', moves: { APPROVED: 'PAYMENT_MARKED' } },
  CONFIRM_RECEIVED: { side: 'CREATOR', moves: { PAYMENT_MARKED: 'COMPLETED' } },
  REPORT_NOT_RECEIVED: { side: 'CREATOR', moves: { PAYMENT_MARKED: 'PAYMENT_MARKED' } },
  CANCEL: {
    side: 'EITHER',
    moves: Object.fromEntries(BEFORE_PAYMENT.map((status) => [status, 'CANCELLED'])),
  },
};

/** What the status alone can't tell: the contract, review and payment so far. */
export interface DealFacts {
  readonly hasContract: boolean;
  /** The sides that accepted the current contract version. */
  readonly contractAcceptedBy: readonly CollabSide[];
  readonly changeRequestsUsed: number;
  readonly maxChangeRequests: number;
  readonly hasSubmissions: boolean;
  /** ADR-013: paid directly, or held by the gateway; the held payment's status, if any. */
  readonly paymentMethod: PaymentMethod;
  readonly escrowStatus: EscrowStatus | null;
  readonly hasPayoutAccount: boolean;
}

export type DealActionBlocker =
  | 'NO_CONTRACT'
  | 'ALREADY_ACCEPTED'
  | 'CONTRACT_NOT_SIGNED'
  | 'NO_ROUNDS_LEFT'
  | 'NOT_ESCROW'
  | 'NO_PAYOUT_ACCOUNT'
  | 'ALREADY_FUNDED'
  | 'NOT_FUNDED'
  | 'ESCROW_FUNDED'
  | 'PAID_THROUGH_ESCROW'
  | 'ESCROW_NEEDS_ADMIN';

/** ADR-012: a contract version is signed once both sides accepted it. */
export function isContractSigned(acceptedBy: readonly CollabSide[]): boolean {
  return acceptedBy.includes('BRAND') && acceptedBy.includes('CREATOR');
}

/**
 * ADR-012 / ADR-013: why an action the status allows still can't happen, or null. Work
 * starts only under a contract both sides accepted (and, with escrow, once the brand's
 * payment is held); changes can be asked for a limited number of times; escrow deals are
 * paid out by the gateway, never marked paid by hand.
 */
export function dealActionBlocker(
  action: DealAction,
  side: CollabSide,
  facts: DealFacts,
): DealActionBlocker | null {
  const isEscrow = facts.paymentMethod === 'ESCROW';
  const isHeld = isEscrowHeld(facts.escrowStatus);
  switch (action) {
    case 'ISSUE_CONTRACT':
      // The amount is fixed once the brand has paid it in.
      return isHeld ? 'ESCROW_FUNDED' : null;
    case 'ACCEPT_CONTRACT':
      if (!facts.hasContract) return 'NO_CONTRACT';
      return facts.contractAcceptedBy.includes(side) ? 'ALREADY_ACCEPTED' : null;
    case 'FUND_ESCROW':
      if (!isEscrow) return 'NOT_ESCROW';
      if (!isContractSigned(facts.contractAcceptedBy)) return 'CONTRACT_NOT_SIGNED';
      if (!facts.hasPayoutAccount) return 'NO_PAYOUT_ACCOUNT';
      return facts.escrowStatus === null || facts.escrowStatus === 'AWAITING_PAYMENT'
        ? null
        : 'ALREADY_FUNDED';
    case 'SUBMIT_WORK':
      if (!isContractSigned(facts.contractAcceptedBy)) return 'CONTRACT_NOT_SIGNED';
      return isEscrow && !isHeld ? 'NOT_FUNDED' : null;
    case 'REQUEST_CHANGES':
      return facts.changeRequestsUsed < facts.maxChangeRequests ? null : 'NO_ROUNDS_LEFT';
    case 'MARK_PAID':
    case 'CONFIRM_RECEIVED':
    case 'REPORT_NOT_RECEIVED':
      return isEscrow ? 'PAID_THROUGH_ESCROW' : null;
    case 'CANCEL':
      return isHeld && !canCancelFundedDeal(facts.hasSubmissions) ? 'ESCROW_NEEDS_ADMIN' : null;
    default:
      return null;
  }
}

/** The status after `action`, or null when this side can't do it in this status. */
export function nextDealStatus(
  status: DealStatus,
  action: DealAction,
  side: CollabSide,
): DealStatus | null {
  const transition = TRANSITIONS[action];
  if (transition.side !== 'EITHER' && transition.side !== side) return null;
  return transition.moves[status] ?? null;
}

/** Whether the action belongs to this side at all (else NOT_ALLOWED rather than out of order). */
export function isActionForSide(action: DealAction, side: CollabSide): boolean {
  const owner = TRANSITIONS[action].side;
  return owner === 'EITHER' || owner === side;
}

/** The actions this side can take now, for showing the right buttons. */
export function allowedDealActions(
  status: DealStatus,
  side: CollabSide,
  facts: DealFacts,
): DealAction[] {
  return (Object.keys(TRANSITIONS) as DealAction[]).filter(
    (action) =>
      nextDealStatus(status, action, side) !== null &&
      dealActionBlocker(action, side, facts) === null,
  );
}

/** FR-9.2: the advance and the balance of an agreed amount, in minor units. */
export function splitPayment(
  amountMinor: number,
  advancePercent: number | null,
): { advanceMinor: number; balanceMinor: number } {
  const advanceMinor = Math.round((amountMinor * (advancePercent ?? 0)) / PERCENT);
  return { advanceMinor, balanceMinor: amountMinor - advanceMinor };
}

/**
 * UC-R5: when payment is due: the agreed due date, or `graceDays` after the work was
 * approved when no date was agreed. Null before approval without a date.
 */
export function paymentDueAt(
  deal: { readonly paymentDueOn: Date | null; readonly approvedAt: Date | null },
  graceDays: number,
): Date | null {
  if (deal.paymentDueOn) return new Date(deal.paymentDueOn.getTime() + DAY_MS);
  return deal.approvedAt ? new Date(deal.approvedAt.getTime() + graceDays * DAY_MS) : null;
}

/** UC-R5: an overdue payment is reminded every `repeatDays` until it is marked paid. */
export function isPaymentReminderDue(
  deal: {
    readonly status: DealStatus;
    readonly paymentDueOn: Date | null;
    readonly approvedAt: Date | null;
    readonly paymentReminderSentAt: Date | null;
  },
  now: Date,
  days: { readonly graceDays: number; readonly repeatDays: number },
): boolean {
  if (deal.status !== 'APPROVED') return false;
  const dueAt = paymentDueAt(deal, days.graceDays);
  if (!dueAt || dueAt > now) return false;
  return (
    deal.paymentReminderSentAt === null ||
    now.getTime() - deal.paymentReminderSentAt.getTime() >= days.repeatDays * DAY_MS
  );
}

/** UC-R4: the content deadline passed with no work submitted; both sides are reminded once. */
export function isDeadlineReminderDue(
  deal: {
    readonly status: DealStatus;
    readonly deadline: Date;
    readonly deadlineReminderSentAt: Date | null;
  },
  now: Date,
): boolean {
  const isWaitingForWork = deal.status === 'ACCEPTED' || deal.status === 'CHANGES_REQUESTED';
  const endOfDeadlineDay = deal.deadline.getTime() + DAY_MS;
  return isWaitingForWork && endOfDeadlineDay <= now.getTime() && !deal.deadlineReminderSentAt;
}

/** ADR-012: when work under review is approved automatically if the brand doesn't act. */
export function reviewDueAt(submittedAt: Date, reviewDays: number): Date {
  return new Date(submittedAt.getTime() + reviewDays * DAY_MS);
}
