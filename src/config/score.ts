/**
 * Content score configuration (FR-4). Changing any value here means bumping
 * SCORE_WEIGHTS_VERSION, so every stored score says which rules produced it (FR-4.3).
 * The numbers are starting assumptions to tune with real campaign results (spec: open
 * decisions).
 */
export const SCORE_WEIGHTS_VERSION = 'v1';

/** Share of each component in the final 0–100 score. Must add up to 1. */
export const SCORE_WEIGHTS = {
  engagement: 0.35,
  consistency: 0.2,
  growth: 0.15,
  authenticity: 0.2,
  completeness: 0.1,
} as const;

export type ScoreComponentName = keyof typeof SCORE_WEIGHTS;

/** FR-4.4 tiers by total followers: lower bound of each tier. */
export const TIER_LOWER_BOUNDS = {
  NANO: 0,
  MICRO: 10_000,
  MID: 100_000,
  MACRO: 500_000,
  MEGA: 1_000_000,
} as const;

export type CreatorTier = keyof typeof TIER_LOWER_BOUNDS;

/**
 * Typical engagement rate per tier, in basis points (100 = 1%): interactions per post as a
 * share of followers. A creator at the tier average scores 50 on engagement.
 */
export const TIER_AVERAGE_ENGAGEMENT_BP: Readonly<Record<CreatorTier, number>> = {
  NANO: 400,
  MICRO: 250,
  MID: 150,
  MACRO: 120,
  MEGA: 100,
};

/** Posts in the last 30 days that earn a full consistency score. */
export const CONSISTENCY_TARGET_POSTS_PER_MONTH = 8;

/** Growth is measured over this many days (FR-4.2: 90-day trend). */
export const GROWTH_WINDOW_DAYS = 90;
/** Follower growth (%) over the window that earns a full growth score; the same loss scores 0. */
export const GROWTH_FULL_SCORE_PERCENT = 10;
/** UC-C7: below this much history, growth and charts say "need 7 days of data". */
export const MIN_HISTORY_DAYS = 7;

/** FR-4.5 authenticity signals. */
export const AUTHENTICITY_RULES = {
  /** Follower jump (%) within any 7-day span that looks bought. */
  followerSpikePercent: 20,
  followerSpikeWindowDays: 7,
  /** Ignore spikes on tiny accounts, where a few follows are a big percentage. */
  followerSpikeMinFollowers: 1_000,
  /** Average views per post below this share of followers suggests inactive followers. */
  minViewsToFollowersRatio: 0.02,
  /** Engagement this many times above or below the tier average is abnormal. */
  abnormalEngagementHighFactor: 5,
  abnormalEngagementLowFactor: 0.1,
  /** Points taken off the authenticity component per flag (it starts at 100). */
  penaltyPerFlag: { FOLLOWER_SPIKE: 40, LOW_VIEWS_RATIO: 30, ABNORMAL_ENGAGEMENT: 30 },
} as const;
