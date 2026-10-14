/** Deal rules: the status flow, payment terms and reminders (FR-9, UC-R4, UC-R5). Pure: no I/O. */
import type { CollabSide } from './chat';

const DAY_MS = 86_400_000;
const PERCENT = 100;

export type DealStatus =
  'ACCEPTED' | 'CONTENT_SUBMITTED' | 'POSTED' | 'PAYMENT_MARKED' | 'COMPLETED' | 'CANCELLED';

/** The order shown on the deal's progress bar (cancelled is shown separately). */
export const DEAL_STEPS: readonly DealStatus[] = [
  'ACCEPTED',
  'CONTENT_SUBMITTED',
  'POSTED',
  'PAYMENT_MARKED',
  'COMPLETED',
];

export type DealAction =
  | 'UPDATE_TERMS'
  | 'SUBMIT_CONTENT'
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

const BEFORE_PAYMENT = ['ACCEPTED', 'CONTENT_SUBMITTED', 'POSTED'] as const;
const unchanged = (statuses: readonly DealStatus[]) =>
  Object.fromEntries(statuses.map((status) => [status, status]));

/**
 * FR-9.1 / UC-R4: who may do what in which status. Anything not listed is out of order and
 * rejected. Posting skips "content submitted" when the brand didn't need to review it.
 */
const TRANSITIONS: Readonly<Record<DealAction, Transition>> = {
  UPDATE_TERMS: { side: 'BRAND', moves: unchanged(BEFORE_PAYMENT) },
  SUBMIT_CONTENT: { side: 'CREATOR', moves: { ACCEPTED: 'CONTENT_SUBMITTED' } },
  ADD_POST: {
    side: 'CREATOR',
    moves: { ACCEPTED: 'POSTED', CONTENT_SUBMITTED: 'POSTED', POSTED: 'POSTED' },
  },
  MARK_PAID: { side: 'BRAND', moves: { POSTED: 'PAYMENT_MARKED' } },
  CONFIRM_RECEIVED: { side: 'CREATOR', moves: { PAYMENT_MARKED: 'COMPLETED' } },
  REPORT_NOT_RECEIVED: { side: 'CREATOR', moves: { PAYMENT_MARKED: 'PAYMENT_MARKED' } },
  CANCEL: {
    side: 'EITHER',
    moves: { ACCEPTED: 'CANCELLED', CONTENT_SUBMITTED: 'CANCELLED', POSTED: 'CANCELLED' },
  },
};

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
export function allowedDealActions(status: DealStatus, side: CollabSide): DealAction[] {
  return (Object.keys(TRANSITIONS) as DealAction[]).filter(
    (action) => nextDealStatus(status, action, side) !== null,
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
 * UC-R5: when payment is due: the agreed due date, or `graceDays` after posting when no
 * date was agreed. Null before anything is posted.
 */
export function paymentDueAt(
  deal: { readonly paymentDueOn: Date | null; readonly postedAt: Date | null },
  graceDays: number,
): Date | null {
  if (deal.paymentDueOn) return new Date(deal.paymentDueOn.getTime() + DAY_MS);
  return deal.postedAt ? new Date(deal.postedAt.getTime() + graceDays * DAY_MS) : null;
}

/** UC-R5: an overdue payment is reminded every `repeatDays` until it is marked paid. */
export function isPaymentReminderDue(
  deal: {
    readonly status: DealStatus;
    readonly paymentDueOn: Date | null;
    readonly postedAt: Date | null;
    readonly paymentReminderSentAt: Date | null;
  },
  now: Date,
  days: { readonly graceDays: number; readonly repeatDays: number },
): boolean {
  if (deal.status !== 'POSTED') return false;
  const dueAt = paymentDueAt(deal, days.graceDays);
  if (!dueAt || dueAt > now) return false;
  return (
    deal.paymentReminderSentAt === null ||
    now.getTime() - deal.paymentReminderSentAt.getTime() >= days.repeatDays * DAY_MS
  );
}

/** UC-R4: the content deadline passed with nothing posted; both sides are reminded once. */
export function isDeadlineReminderDue(
  deal: {
    readonly status: DealStatus;
    readonly deadline: Date;
    readonly deadlineReminderSentAt: Date | null;
  },
  now: Date,
): boolean {
  const isWaitingForContent = deal.status === 'ACCEPTED' || deal.status === 'CONTENT_SUBMITTED';
  const endOfDeadlineDay = deal.deadline.getTime() + DAY_MS;
  return isWaitingForContent && endOfDeadlineDay <= now.getTime() && !deal.deadlineReminderSentAt;
}
