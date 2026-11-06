import { describe, expect, it } from 'vitest';
import { campaignTotals } from '@/domain/campaign-report';
import {
  allowedDealActions,
  dealActionBlocker,
  type DealFacts,
  dealStepOf,
  isActionForSide,
  isContractSigned,
  isDeadlineReminderDue,
  isPaymentReminderDue,
  nextDealStatus,
  paymentDueAt,
  reviewDueAt,
  splitPayment,
} from '@/domain/deals';

const at = (iso: string) => new Date(iso);
/** A deal whose contract both sides accepted, with no change requests used. */
const SIGNED: DealFacts = {
  hasContract: true,
  contractAcceptedBy: ['BRAND', 'CREATOR'],
  changeRequestsUsed: 0,
  maxChangeRequests: 2,
};
const NO_CONTRACT: DealFacts = { ...SIGNED, hasContract: false, contractAcceptedBy: [] };
const BRAND_ONLY: DealFacts = { ...SIGNED, contractAcceptedBy: ['BRAND'] };

describe('deal status flow (FR-9.1, UC-R4, ADR-012)', () => {
  it('moves through the stages in order', () => {
    expect(nextDealStatus('ACCEPTED', 'SUBMIT_WORK', 'CREATOR')).toBe('CONTENT_SUBMITTED');
    expect(nextDealStatus('CONTENT_SUBMITTED', 'APPROVE_WORK', 'BRAND')).toBe('APPROVED');
    expect(nextDealStatus('APPROVED', 'MARK_PAID', 'BRAND')).toBe('PAYMENT_MARKED');
    expect(nextDealStatus('PAYMENT_MARKED', 'CONFIRM_RECEIVED', 'CREATOR')).toBe('COMPLETED');
  });

  it('sends work back for changes and takes a new submission', () => {
    expect(nextDealStatus('CONTENT_SUBMITTED', 'REQUEST_CHANGES', 'BRAND')).toBe(
      'CHANGES_REQUESTED',
    );
    expect(nextDealStatus('CHANGES_REQUESTED', 'SUBMIT_WORK', 'CREATOR')).toBe('CONTENT_SUBMITTED');
    expect(dealStepOf('CHANGES_REQUESTED')).toBe('ACCEPTED');
    expect(dealStepOf('APPROVED')).toBe('APPROVED');
  });

  it('adding a post link never changes the status', () => {
    expect(nextDealStatus('ACCEPTED', 'ADD_POST', 'CREATOR')).toBe('ACCEPTED');
    expect(nextDealStatus('APPROVED', 'ADD_POST', 'CREATOR')).toBe('APPROVED');
    expect(nextDealStatus('COMPLETED', 'ADD_POST', 'CREATOR')).toBeNull();
  });

  it('UC-R4 rejects out-of-order updates', () => {
    expect(nextDealStatus('ACCEPTED', 'MARK_PAID', 'BRAND')).toBeNull();
    expect(nextDealStatus('CONTENT_SUBMITTED', 'MARK_PAID', 'BRAND')).toBeNull();
    expect(nextDealStatus('ACCEPTED', 'APPROVE_WORK', 'BRAND')).toBeNull();
    expect(nextDealStatus('COMPLETED', 'CANCEL', 'BRAND')).toBeNull();
    expect(nextDealStatus('PAYMENT_MARKED', 'CANCEL', 'CREATOR')).toBeNull();
    expect(nextDealStatus('CANCELLED', 'SUBMIT_WORK', 'CREATOR')).toBeNull();
  });

  it('ADR-012 keeps the contract fixed while work is under review or approved', () => {
    expect(nextDealStatus('ACCEPTED', 'ISSUE_CONTRACT', 'BRAND')).toBe('ACCEPTED');
    expect(nextDealStatus('CHANGES_REQUESTED', 'ISSUE_CONTRACT', 'BRAND')).toBe(
      'CHANGES_REQUESTED',
    );
    expect(nextDealStatus('CONTENT_SUBMITTED', 'ISSUE_CONTRACT', 'BRAND')).toBeNull();
    expect(nextDealStatus('APPROVED', 'ISSUE_CONTRACT', 'BRAND')).toBeNull();
    expect(nextDealStatus('ACCEPTED', 'ISSUE_CONTRACT', 'CREATOR')).toBeNull();
  });

  it('only lets each side do its own steps', () => {
    expect(nextDealStatus('APPROVED', 'MARK_PAID', 'CREATOR')).toBeNull();
    expect(nextDealStatus('CONTENT_SUBMITTED', 'APPROVE_WORK', 'CREATOR')).toBeNull();
    expect(isActionForSide('MARK_PAID', 'CREATOR')).toBe(false);
    expect(isActionForSide('CANCEL', 'CREATOR')).toBe(true);
    expect(allowedDealActions('APPROVED', 'BRAND', SIGNED)).toEqual(['MARK_PAID', 'CANCEL']);
    expect(allowedDealActions('CONTENT_SUBMITTED', 'BRAND', SIGNED)).toEqual([
      'REQUEST_CHANGES',
      'APPROVE_WORK',
      'RAISE_DISPUTE',
      'CANCEL',
    ]);
    expect(allowedDealActions('PAYMENT_MARKED', 'CREATOR', SIGNED)).toEqual([
      'CONFIRM_RECEIVED',
      'REPORT_NOT_RECEIVED',
    ]);
    expect(allowedDealActions('COMPLETED', 'BRAND', SIGNED)).toEqual([]);
  });
});

describe('contract and review rules (ADR-012)', () => {
  it('needs both acceptances before work can be submitted', () => {
    expect(isContractSigned(['BRAND', 'CREATOR'])).toBe(true);
    expect(isContractSigned(['BRAND'])).toBe(false);
    expect(dealActionBlocker('SUBMIT_WORK', 'CREATOR', BRAND_ONLY)).toBe('CONTRACT_NOT_SIGNED');
    expect(dealActionBlocker('SUBMIT_WORK', 'CREATOR', NO_CONTRACT)).toBe('CONTRACT_NOT_SIGNED');
    expect(dealActionBlocker('SUBMIT_WORK', 'CREATOR', SIGNED)).toBeNull();
    expect(allowedDealActions('ACCEPTED', 'CREATOR', BRAND_ONLY)).toContain('ACCEPT_CONTRACT');
    expect(allowedDealActions('ACCEPTED', 'CREATOR', BRAND_ONLY)).not.toContain('SUBMIT_WORK');
  });

  it('lets a side accept a contract once, and only one that exists', () => {
    expect(dealActionBlocker('ACCEPT_CONTRACT', 'CREATOR', BRAND_ONLY)).toBeNull();
    expect(dealActionBlocker('ACCEPT_CONTRACT', 'BRAND', BRAND_ONLY)).toBe('ALREADY_ACCEPTED');
    expect(dealActionBlocker('ACCEPT_CONTRACT', 'CREATOR', NO_CONTRACT)).toBe('NO_CONTRACT');
  });

  it('allows a limited number of change requests', () => {
    const oneUsed = { ...SIGNED, changeRequestsUsed: 1 };
    const allUsed = { ...SIGNED, changeRequestsUsed: 2 };
    expect(dealActionBlocker('REQUEST_CHANGES', 'BRAND', oneUsed)).toBeNull();
    expect(dealActionBlocker('REQUEST_CHANGES', 'BRAND', allUsed)).toBe('NO_ROUNDS_LEFT');
    expect(allowedDealActions('CONTENT_SUBMITTED', 'BRAND', allUsed)).toEqual([
      'APPROVE_WORK',
      'RAISE_DISPUTE',
      'CANCEL',
    ]);
  });

  it('sets the automatic approval date from the review period', () => {
    expect(reviewDueAt(at('2026-11-01T10:00:00Z'), 7).toISOString()).toBe(
      '2026-11-08T10:00:00.000Z',
    );
  });
});

describe('payment (FR-9.2, UC-R5)', () => {
  it('splits the amount into advance and balance in paise', () => {
    expect(splitPayment(2_500_000, 30)).toEqual({ advanceMinor: 750_000, balanceMinor: 1_750_000 });
    expect(splitPayment(1_001, 50)).toEqual({ advanceMinor: 501, balanceMinor: 500 });
    expect(splitPayment(1_000_000, null)).toEqual({ advanceMinor: 0, balanceMinor: 1_000_000 });
  });

  it('is due on the agreed date, or 7 days after the work is approved', () => {
    expect(
      paymentDueAt(
        { paymentDueOn: at('2026-11-01T00:00:00Z'), approvedAt: null },
        7,
      )?.toISOString(),
    ).toBe('2026-11-02T00:00:00.000Z');
    expect(
      paymentDueAt(
        { paymentDueOn: null, approvedAt: at('2026-11-01T10:00:00Z') },
        7,
      )?.toISOString(),
    ).toBe('2026-11-08T10:00:00.000Z');
    expect(paymentDueAt({ paymentDueOn: null, approvedAt: null }, 7)).toBeNull();
  });

  it('UC-R5 reminds about overdue payments weekly until marked paid', () => {
    const approved = {
      status: 'APPROVED' as const,
      paymentDueOn: null,
      approvedAt: at('2026-11-01T00:00:00Z'),
    };
    const days = { graceDays: 7, repeatDays: 7 };

    expect(
      isPaymentReminderDue(
        { ...approved, paymentReminderSentAt: null },
        at('2026-11-07T00:00:00Z'),
        days,
      ),
    ).toBe(false);
    expect(
      isPaymentReminderDue(
        { ...approved, paymentReminderSentAt: null },
        at('2026-11-08T00:00:00Z'),
        days,
      ),
    ).toBe(true);
    expect(
      isPaymentReminderDue(
        { ...approved, paymentReminderSentAt: at('2026-11-08T00:00:00Z') },
        at('2026-11-12T00:00:00Z'),
        days,
      ),
    ).toBe(false);
    expect(
      isPaymentReminderDue(
        { ...approved, paymentReminderSentAt: at('2026-11-08T00:00:00Z') },
        at('2026-11-15T00:00:00Z'),
        days,
      ),
    ).toBe(true);
    expect(
      isPaymentReminderDue(
        { ...approved, status: 'PAYMENT_MARKED', paymentReminderSentAt: null },
        at('2026-12-01T00:00:00Z'),
        days,
      ),
    ).toBe(false);
  });

  it('UC-R4 reminds once when the content deadline passes with no work submitted', () => {
    const deal = {
      status: 'ACCEPTED' as const,
      deadline: at('2026-11-15T00:00:00Z'),
      deadlineReminderSentAt: null,
    };

    expect(isDeadlineReminderDue(deal, at('2026-11-15T23:00:00Z'))).toBe(false);
    expect(isDeadlineReminderDue(deal, at('2026-11-16T00:00:00Z'))).toBe(true);
    expect(
      isDeadlineReminderDue(
        { ...deal, deadlineReminderSentAt: new Date(0) },
        at('2026-12-01T00:00:00Z'),
      ),
    ).toBe(false);
    expect(
      isDeadlineReminderDue({ ...deal, status: 'CONTENT_SUBMITTED' }, at('2026-12-01T00:00:00Z')),
    ).toBe(false);
    expect(
      isDeadlineReminderDue({ ...deal, status: 'CHANGES_REQUESTED' }, at('2026-12-01T00:00:00Z')),
    ).toBe(true);
  });
});

describe('campaign report (FR-9.3)', () => {
  it('totals posts, engagement and costs, leaving out cancelled deals', () => {
    const totals = campaignTotals([
      {
        isCancelled: false,
        agreedAmountMinor: 1_000_000,
        posts: [{ views: 40_000, likes: 1_800, comments: 200 }],
      },
      {
        isCancelled: false,
        agreedAmountMinor: null,
        posts: [{ views: null, likes: 500, comments: 50 }],
      },
      {
        isCancelled: true,
        agreedAmountMinor: 5_000_000,
        posts: [{ views: 1, likes: 1, comments: 1 }],
      },
    ]);

    expect(totals).toEqual({
      dealCount: 2,
      postCount: 2,
      views: 40_000,
      likes: 2_300,
      comments: 250,
      engagementRateBp: 638,
      spendMinor: 1_000_000,
      // ₹10,000 / 40,000 views × 1,000 = ₹250 per 1,000 views.
      costPerThousandViewsMinor: 25_000,
      // ₹10,000 / 2,000 likes and comments = ₹5 each.
      costPerEngagementMinor: 500,
    });
  });

  it('has no views or costs to show without data', () => {
    const totals = campaignTotals([
      {
        isCancelled: false,
        agreedAmountMinor: null,
        posts: [{ views: null, likes: 10, comments: 1 }],
      },
    ]);

    expect(totals).toMatchObject({
      views: null,
      engagementRateBp: null,
      costPerThousandViewsMinor: null,
      costPerEngagementMinor: null,
    });
  });
});
