import { describe, expect, it } from 'vitest';
import { averageTenths, hasValidScores, isRatingVisible, ratingRevealDate } from '@/domain/ratings';

describe('ratings (FR-10, UC-R7)', () => {
  it('FR-10.1 needs every criterion of the rater’s side, 1 to 5 stars each', () => {
    expect(hasValidScores('BRAND', { contentQuality: 5, onTime: 4, communication: 3 })).toBe(true);
    expect(hasValidScores('CREATOR', { clearBrief: 5, paidOnTime: 1, communication: 2 })).toBe(
      true,
    );
    expect(hasValidScores('BRAND', { contentQuality: 5, onTime: 4 })).toBe(false);
    expect(hasValidScores('BRAND', { clearBrief: 5, paidOnTime: 4, communication: 3 })).toBe(false);
    expect(hasValidScores('BRAND', { contentQuality: 6, onTime: 4, communication: 3 })).toBe(false);
    expect(hasValidScores('BRAND', { contentQuality: 4.5, onTime: 4, communication: 3 })).toBe(
      false,
    );
  });

  it('averages in tenths so totals stay whole numbers', () => {
    expect(averageTenths({ contentQuality: 5, onTime: 4, communication: 4 })).toBe(43);
    expect(averageTenths({ clearBrief: 1, paidOnTime: 1, communication: 1 })).toBe(10);
  });

  it('UC-R7 reveals a lone rating 14 days after completion', () => {
    const revealAt = ratingRevealDate(new Date('2026-11-01T10:00:00Z'), 14);

    expect(revealAt.toISOString()).toBe('2026-11-15T10:00:00.000Z');
    expect(
      isRatingVisible({ visibleFrom: revealAt, isHidden: false }, new Date('2026-11-15T09:59:59Z')),
    ).toBe(false);
    expect(isRatingVisible({ visibleFrom: revealAt, isHidden: false }, revealAt)).toBe(true);
  });

  it('FR-10.3 never shows a rating an admin hid', () => {
    expect(isRatingVisible({ visibleFrom: new Date(0), isHidden: true }, new Date())).toBe(false);
  });
});
