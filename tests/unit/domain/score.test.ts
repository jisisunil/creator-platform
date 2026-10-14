import { describe, expect, it } from 'vitest';
import { type AccountHistory, computeContentScore, type DailyStats } from '@/domain/score';

const DAY = 86_400_000;
const start = new Date('2026-06-01T00:00:00Z');

/** A history of `days` days with followers growing linearly from `from` to `to`. */
function history(
  days: number,
  from: number,
  to: number,
  perDay: Partial<DailyStats> = {},
): DailyStats[] {
  return Array.from({ length: days }, (_, index) => ({
    capturedOn: new Date(start.getTime() + index * DAY),
    followers: Math.round(from + ((to - from) * index) / Math.max(days - 1, 1)),
    posts30d: 8,
    views30d: null,
    likes30d: 8 * 1000,
    comments30d: 8 * 100,
    ...perDay,
  }));
}

function account(stats: DailyStats[], overrides: Partial<AccountHistory> = {}): AccountHistory {
  return { accountId: 'acc-1', isFollowerCountHidden: false, history: stats, ...overrides };
}

describe('computeContentScore (FR-4)', () => {
  it('FR-4.1 scores a steady, average micro creator in the middle of the range', () => {
    // 50k followers, 1,100 interactions per post = 2.2% (micro average 2.5%), flat growth.
    const result = computeContentScore({
      accounts: [account(history(100, 50_000, 50_000))],
      completenessPercent: 100,
    });

    expect(result.tier).toBe('MICRO');
    expect(result.engagementRateBp).toBe(220);
    expect(result.components.engagement.score).toBe(44);
    expect(result.components.consistency.score).toBe(100);
    expect(result.components.growth).toEqual({ score: 50, growthPercent: 0 });
    expect(result.components.authenticity).toEqual({ score: 100, flags: [] });
    expect(result.score).toBe(
      Math.round(44 * 0.35 + 100 * 0.2 + 50 * 0.15 + 100 * 0.2 + 100 * 0.1),
    );
    expect(result.weightsVersion).toBe('v1');
  });

  it('FR-4.2 rewards 90-day growth and penalises decline', () => {
    const growing = computeContentScore({
      accounts: [account(history(91, 40_000, 44_000))],
      completenessPercent: 0,
    });
    const shrinking = computeContentScore({
      accounts: [account(history(91, 44_000, 39_600))],
      completenessPercent: 0,
    });

    expect(growing.components.growth).toEqual({ score: 100, growthPercent: 10 });
    expect(shrinking.components.growth).toEqual({ score: 0, growthPercent: -10 });
  });

  it('UC-C7 treats growth as neutral without 7 days of history', () => {
    const result = computeContentScore({
      accounts: [account(history(3, 10_000, 12_000))],
      completenessPercent: 50,
    });

    expect(result.components.growth).toEqual({ score: 50, growthPercent: null });
  });

  it('FR-4.5 flags a follower spike and lowers the authenticity score', () => {
    const stats = history(30, 20_000, 20_000);
    const spiked = stats.map((day, index) => (index >= 20 ? { ...day, followers: 30_000 } : day));

    const result = computeContentScore({ accounts: [account(spiked)], completenessPercent: 100 });

    expect(result.components.authenticity.flags.map((flag) => flag.type)).toContain(
      'FOLLOWER_SPIKE',
    );
    expect(result.components.authenticity.score).toBe(60);
  });

  it('UC-M2 ignores a signal an admin recently cleared as a false alarm', () => {
    const stats = history(30, 20_000, 20_000);
    const spiked = stats.map((day, index) => (index >= 20 ? { ...day, followers: 30_000 } : day));

    const result = computeContentScore({
      accounts: [account(spiked)],
      completenessPercent: 100,
      clearedFlagTypes: ['FOLLOWER_SPIKE'],
    });

    expect(result.components.authenticity.flags).toEqual([]);
    expect(result.components.authenticity.score).toBe(100);
  });

  it('FR-4.5 ignores spikes on tiny accounts', () => {
    const stats = history(20, 100, 100).map((day, index) =>
      index >= 10 ? { ...day, followers: 500 } : day,
    );

    const result = computeContentScore({ accounts: [account(stats)], completenessPercent: 100 });

    expect(result.components.authenticity.flags.map((flag) => flag.type)).not.toContain(
      'FOLLOWER_SPIKE',
    );
  });

  it('FR-4.5 flags very low views compared with followers', () => {
    const result = computeContentScore({
      accounts: [account(history(10, 100_000, 100_000, { views30d: 8 * 500 }))],
      completenessPercent: 100,
    });

    expect(result.components.authenticity.flags.map((flag) => flag.type)).toContain(
      'LOW_VIEWS_RATIO',
    );
  });

  it('FR-4.5 flags engagement far above the tier average', () => {
    // 10k followers with 6,000 interactions per post = 60%, 24x the micro average.
    const result = computeContentScore({
      accounts: [account(history(10, 10_000, 10_000, { likes30d: 8 * 6000, comments30d: 0 }))],
      completenessPercent: 100,
    });

    expect(result.components.authenticity.flags.map((flag) => flag.type)).toEqual([
      'ABNORMAL_ENGAGEMENT',
    ]);
  });

  it('combines accounts across platforms', () => {
    const youtube = account(history(10, 30_000, 30_000), { accountId: 'yt' });
    const instagram = account(history(10, 20_000, 20_000, { posts30d: 4 }), { accountId: 'ig' });

    const result = computeContentScore({
      accounts: [youtube, instagram],
      completenessPercent: 100,
    });

    expect(result.totalFollowers).toBe(50_000);
    expect(result.components.consistency.postsLast30Days).toBe(12);
  });

  it('UC-C2 leaves hidden subscriber counts out of follower maths', () => {
    const hidden = account(history(10, 0, 0), { isFollowerCountHidden: true });

    const result = computeContentScore({ accounts: [hidden], completenessPercent: 100 });

    expect(result.totalFollowers).toBe(0);
    expect(result.components.engagement.score).toBe(50);
  });

  it('scores a creator with no connected accounts on completeness alone', () => {
    const result = computeContentScore({ accounts: [], completenessPercent: 100 });

    expect(result.tier).toBe('NANO');
    expect(result.components.consistency.score).toBe(0);
  });
});
