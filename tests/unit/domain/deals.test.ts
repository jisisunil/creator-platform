import { describe, expect, it } from 'vitest';
import { campaignTotals } from '@/domain/campaign-report';
import {
  allowedDealActions,
  isActionForSide,
  isDeadlineReminderDue,
  isPaymentReminderDue,
  nextDealStatus,
  paymentDueAt,
  splitPayment,
} from '@/domain/deals';

const at = (iso: string) => new Date(iso);

describe('deal status flow (FR-9.1, UC-R4)', () => {
  it('moves through the stages in order', () => {
    expect(nextDealStatus('ACCEPTED', 'SUBMIT_CONTENT', 'CREATOR')).toBe('CONTENT_SUBMITTED');
    expect(nextDealStatus('CONTENT_SUBMITTED', 'ADD_POST', 'CREATOR')).toBe('POSTED');
    expect(nextDealStatus('POSTED', 'MARK_PAID', 'BRAND')).toBe('PAYMENT_MARKED');
    expect(nextDealStatus('PAYMENT_MARKED', 'CONFIRM_RECEIVED', 'CREATOR')).toBe('COMPLETED');
  });

  it('lets the creator post without a separate content review', () => {
    expect(nextDealStatus('ACCEPTED', 'ADD_POST', 'CREATOR')).toBe('POSTED');
    expect(nextDealStatus('POSTED', 'ADD_POST', 'CREATOR')).toBe('POSTED');
  });

  it('UC-R4 rejects out-of-order updates', () => {
    expect(nextDealStatus('ACCEPTED', 'MARK_PAID', 'BRAND')).toBeNull();
    expect(nextDealStatus('COMPLETED', 'CANCEL', 'BRAND')).toBeNull();
    expect(nextDealStatus('PAYMENT_MARKED', 'CANCEL', 'CREATOR')).toBeNull();
    expect(nextDealStatus('CANCELLED', 'ADD_POST', 'CREATOR')).toBeNull();
  });

  it('only lets each side do its own steps', () => {
    expect(nextDealStatus('POSTED', 'MARK_PAID', 'CREATOR')).toBeNull();
    expect(isActionForSide('MARK_PAID', 'CREATOR')).toBe(false);
    expect(isActionForSide('CANCEL', 'CREATOR')).toBe(true);
    expect(allowedDealActions('POSTED', 'BRAND')).toEqual(['UPDATE_TERMS', 'MARK_PAID', 'CANCEL']);
    expect(allowedDealActions('PAYMENT_MARKED', 'CREATOR')).toEqual([
      'CONFIRM_RECEIVED',
      'REPORT_NOT_RECEIVED',
    ]);
    expect(allowedDealActions('COMPLETED', 'BRAND')).toEqual([]);
  });
});

describe('payment (FR-9.2, UC-R5)', () => {
  it('splits the amount into advance and balance in paise', () => {
    expect(splitPayment(2_500_000, 30)).toEqual({ advanceMinor: 750_000, balanceMinor: 1_750_000 });
    expect(splitPayment(1_001, 50)).toEqual({ advanceMinor: 501, balanceMinor: 500 });
    expect(splitPayment(1_000_000, null)).toEqual({ advanceMinor: 0, balanceMinor: 1_000_000 });
  });

  it('is due on the agreed date, or 7 days after posting', () => {
    expect(
      paymentDueAt({ paymentDueOn: at('2026-11-01T00:00:00Z'), postedAt: null }, 7)?.toISOString(),
    ).toBe('2026-11-02T00:00:00.000Z');
    expect(
      paymentDueAt({ paymentDueOn: null, postedAt: at('2026-11-01T10:00:00Z') }, 7)?.toISOString(),
    ).toBe('2026-11-08T10:00:00.000Z');
    expect(paymentDueAt({ paymentDueOn: null, postedAt: null }, 7)).toBeNull();
  });

  it('UC-R5 reminds about overdue payments weekly until marked paid', () => {
    const posted = {
      status: 'POSTED' as const,
      paymentDueOn: null,
      postedAt: at('2026-11-01T00:00:00Z'),
    };
    const days = { graceDays: 7, repeatDays: 7 };

    expect(
      isPaymentReminderDue(
        { ...posted, paymentReminderSentAt: null },
        at('2026-11-07T00:00:00Z'),
        days,
      ),
    ).toBe(false);
    expect(
      isPaymentReminderDue(
        { ...posted, paymentReminderSentAt: null },
        at('2026-11-08T00:00:00Z'),
        days,
      ),
    ).toBe(true);
    expect(
      isPaymentReminderDue(
        { ...posted, paymentReminderSentAt: at('2026-11-08T00:00:00Z') },
        at('2026-11-12T00:00:00Z'),
        days,
      ),
    ).toBe(false);
    expect(
      isPaymentReminderDue(
        { ...posted, paymentReminderSentAt: at('2026-11-08T00:00:00Z') },
        at('2026-11-15T00:00:00Z'),
        days,
      ),
    ).toBe(true);
    expect(
      isPaymentReminderDue(
        { ...posted, status: 'PAYMENT_MARKED', paymentReminderSentAt: null },
        at('2026-12-01T00:00:00Z'),
        days,
      ),
    ).toBe(false);
  });

  it('UC-R4 reminds once when the content deadline passes with nothing posted', () => {
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
    expect(isDeadlineReminderDue({ ...deal, status: 'POSTED' }, at('2026-12-01T00:00:00Z'))).toBe(
      false,
    );
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
