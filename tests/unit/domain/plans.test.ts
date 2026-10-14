import { describe, expect, it } from 'vitest';
import { canonicalMailbox } from '@/domain/email-address';
import {
  creditPackExpiry,
  isTrialOver,
  packToUse,
  trialNoticeDue,
  usableCredits,
} from '@/domain/plans';
import { nextContactPeriodStart } from '@/domain/requests';

const at = (iso: string) => new Date(iso);
const NOW = at('2026-10-15T10:00:00Z');

describe('trials (UC-B1, UC-D1)', () => {
  it('a trial is over from its end time; plans without an end never are', () => {
    expect(isTrialOver(at('2026-10-15T10:00:00Z'), NOW)).toBe(true);
    expect(isTrialOver(at('2026-10-15T10:00:01Z'), NOW)).toBe(false);
    expect(isTrialOver(null, NOW)).toBe(false);
  });

  it('sends "ending soon" within 3 days, then "ended", each once', () => {
    const notices = { trialEndingNoticeSentAt: null, trialEndedNoticeSentAt: null };

    expect(
      trialNoticeDue({ ...notices, trialEndsAt: at('2026-10-20T10:00:00Z') }, NOW, 3),
    ).toBeNull();
    expect(trialNoticeDue({ ...notices, trialEndsAt: at('2026-10-18T09:00:00Z') }, NOW, 3)).toBe(
      'ENDING',
    );
    expect(
      trialNoticeDue(
        {
          trialEndsAt: at('2026-10-18T09:00:00Z'),
          trialEndingNoticeSentAt: NOW,
          trialEndedNoticeSentAt: null,
        },
        NOW,
        3,
      ),
    ).toBeNull();
    expect(trialNoticeDue({ ...notices, trialEndsAt: at('2026-10-14T00:00:00Z') }, NOW, 3)).toBe(
      'ENDED',
    );
    expect(trialNoticeDue({ ...notices, trialEndsAt: null }, NOW, 3)).toBeNull();
  });

  it('UC-B1 spots repeated sign-ups behind +tags and Gmail dots', () => {
    expect(canonicalMailbox('R.avi+trial2@Gmail.com')).toBe('ravi@gmail.com');
    expect(canonicalMailbox('ravi@googlemail.com')).toBe('ravi@gmail.com');
    expect(canonicalMailbox('ravi.k+x@spiceco.in')).toBe('ravi.k@spiceco.in');
  });
});

describe('credit packs (pay-as-you-go)', () => {
  const pack = (id: string, used: number, expiresAt: string) => ({
    id,
    credits: 10,
    creditsUsed: used,
    expiresAt: at(expiresAt),
  });

  it('counts unused credits in packs that have not expired', () => {
    const packs = [
      pack('a', 4, '2026-12-01T00:00:00Z'),
      pack('b', 0, '2026-10-01T00:00:00Z'),
      pack('c', 10, '2026-12-01T00:00:00Z'),
    ];

    expect(usableCredits(packs, NOW)).toBe(6);
  });

  it('uses the pack that expires first', () => {
    const packs = [
      pack('late', 0, '2027-01-01T00:00:00Z'),
      pack('soon', 9, '2026-11-01T00:00:00Z'),
    ];

    expect(packToUse(packs, NOW)?.id).toBe('soon');
    expect(packToUse([pack('done', 10, '2027-01-01T00:00:00Z')], NOW)).toBeNull();
  });

  it('is valid for 90 days', () => {
    expect(creditPackExpiry(NOW, 90).toISOString()).toBe('2027-01-13T10:00:00.000Z');
  });
});

describe('monthly allowance renewal (FR-11.1)', () => {
  it('renews on the plan start day each month; trials never renew', () => {
    const started = at('2026-01-31T00:00:00Z');

    expect(
      nextContactPeriodStart('MONTHLY', started, at('2026-02-10T00:00:00Z'))?.toISOString(),
    ).toBe('2026-02-28T00:00:00.000Z');
    expect(
      nextContactPeriodStart('MONTHLY', started, at('2026-03-05T00:00:00Z'))?.toISOString(),
    ).toBe('2026-03-31T00:00:00.000Z');
    expect(nextContactPeriodStart('NONE', started, NOW)).toBeNull();
  });
});
