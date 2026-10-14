import {
  AUTHENTICITY_RULES,
  CONSISTENCY_TARGET_POSTS_PER_MONTH,
  type CreatorTier,
  GROWTH_FULL_SCORE_PERCENT,
  GROWTH_WINDOW_DAYS,
  MIN_HISTORY_DAYS,
  SCORE_WEIGHTS,
  SCORE_WEIGHTS_VERSION,
  TIER_AVERAGE_ENGAGEMENT_BP,
} from '@/config/score';
import { engagementRateBp, tierForFollowers } from './creators';

/** One day of an account's statistics (FR-3.4). Dates are UTC calendar days. */
export interface DailyStats {
  readonly capturedOn: Date;
  readonly followers: number;
  readonly posts30d: number;
  readonly views30d: number | null;
  readonly likes30d: number;
  readonly comments30d: number;
}

export interface AccountHistory {
  readonly accountId: string;
  /** YouTube can hide subscriber counts; such accounts don't count towards follower maths. */
  readonly isFollowerCountHidden: boolean;
  /** Oldest first. */
  readonly history: readonly DailyStats[];
}

export interface ScoreInput {
  readonly accounts: readonly AccountHistory[];
  readonly completenessPercent: number;
  /** UC-M2: signals an admin recently cleared as false alarms; they neither count nor flag. */
  readonly clearedFlagTypes?: readonly AuthenticityFlagType[];
}

export type AuthenticityFlagType = 'FOLLOWER_SPIKE' | 'LOW_VIEWS_RATIO' | 'ABNORMAL_ENGAGEMENT';

export interface DetectedFlag {
  readonly type: AuthenticityFlagType;
  readonly accountId: string | null;
  readonly details: Readonly<Record<string, number>>;
}

/** The transparent breakdown shown on every profile (FR-4.2). */
export interface ScoreBreakdown {
  readonly score: number;
  readonly weightsVersion: string;
  readonly tier: CreatorTier;
  readonly totalFollowers: number;
  readonly engagementRateBp: number;
  readonly components: {
    readonly engagement: { readonly score: number; readonly tierAverageBp: number };
    readonly consistency: { readonly score: number; readonly postsLast30Days: number };
    readonly growth: {
      readonly score: number;
      /** Follower growth over the window, null without enough history (UC-C7). */
      readonly growthPercent: number | null;
    };
    readonly authenticity: { readonly score: number; readonly flags: readonly DetectedFlag[] };
    readonly completeness: { readonly score: number };
  };
}

const DAY_MS = 86_400_000;
const NEUTRAL_SCORE = 50;
const MAX_SCORE = 100;

const clampScore = (value: number): number => Math.round(Math.min(MAX_SCORE, Math.max(0, value)));

const latestOf = (account: AccountHistory): DailyStats | undefined =>
  account.history[account.history.length - 1];

function daysBetween(earlier: Date, later: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / DAY_MS);
}

/**
 * Follower growth (%) over the growth window, follower-weighted across accounts that have
 * at least MIN_HISTORY_DAYS of history. Null when none do.
 */
export function growthPercent(accounts: readonly AccountHistory[]): number | null {
  let weightedGrowth = 0;
  let totalWeight = 0;
  for (const account of accounts) {
    const latest = latestOf(account);
    if (!latest || account.isFollowerCountHidden) continue;
    const windowStart = new Date(latest.capturedOn.getTime() - GROWTH_WINDOW_DAYS * DAY_MS);
    const baseline = account.history.find((day) => day.capturedOn >= windowStart);
    if (!baseline || baseline.followers <= 0) continue;
    if (daysBetween(baseline.capturedOn, latest.capturedOn) < MIN_HISTORY_DAYS) continue;
    const growth = ((latest.followers - baseline.followers) / baseline.followers) * 100;
    weightedGrowth += growth * latest.followers;
    totalWeight += latest.followers;
  }
  return totalWeight === 0 ? null : weightedGrowth / totalWeight;
}

/** FR-4.5: signals of bought followers or fake engagement, per account and overall. */
export function detectAuthenticityFlags(
  accounts: readonly AccountHistory[],
  overallEngagementBp: number,
  tier: CreatorTier,
): DetectedFlag[] {
  const rules = AUTHENTICITY_RULES;
  const flags: DetectedFlag[] = [];

  for (const account of accounts) {
    if (account.isFollowerCountHidden) continue;
    const history = account.history;
    for (let end = 1; end < history.length; end += 1) {
      const current = history[end];
      if (!current || current.followers < rules.followerSpikeMinFollowers) continue;
      const spanStart =
        history.findLast(
          (day) => daysBetween(day.capturedOn, current.capturedOn) >= rules.followerSpikeWindowDays,
        ) ?? history[0];
      if (!spanStart || spanStart.followers <= 0 || spanStart === current) continue;
      const jumpPercent = ((current.followers - spanStart.followers) / spanStart.followers) * 100;
      if (jumpPercent >= rules.followerSpikePercent) {
        flags.push({
          type: 'FOLLOWER_SPIKE',
          accountId: account.accountId,
          details: { jumpPercent: Math.round(jumpPercent), followers: current.followers },
        });
        break;
      }
    }

    const latest = latestOf(account);
    if (latest && latest.views30d !== null && latest.posts30d > 0 && latest.followers > 0) {
      const viewsPerPostRatio = latest.views30d / latest.posts30d / latest.followers;
      if (viewsPerPostRatio < rules.minViewsToFollowersRatio) {
        flags.push({
          type: 'LOW_VIEWS_RATIO',
          accountId: account.accountId,
          details: { viewsPerPostRatioPermille: Math.round(viewsPerPostRatio * 1000) },
        });
      }
    }
  }

  const tierAverage = TIER_AVERAGE_ENGAGEMENT_BP[tier];
  const isTooHigh = overallEngagementBp > tierAverage * rules.abnormalEngagementHighFactor;
  const isTooLow =
    overallEngagementBp > 0 &&
    overallEngagementBp < tierAverage * rules.abnormalEngagementLowFactor;
  if (isTooHigh || isTooLow) {
    flags.push({
      type: 'ABNORMAL_ENGAGEMENT',
      accountId: null,
      details: { engagementRateBp: overallEngagementBp, tierAverageBp: tierAverage },
    });
  }
  return flags;
}

/**
 * FR-4: the 0–100 content score. Each component is 0–100; the final score is their
 * weighted sum with the versioned weights in config/score.ts.
 * - engagement: 50 at the tier average, 100 at twice it
 * - consistency: posts in the last 30 days against the monthly target
 * - growth: 50 for flat, 100 for +10% over 90 days, 0 for −10%; neutral without history
 * - authenticity: 100 minus a penalty per flag
 * - completeness: share of profile fields filled in
 */
export function computeContentScore(input: ScoreInput): ScoreBreakdown {
  const latestStats = input.accounts
    .map((account) => ({ account, latest: latestOf(account) }))
    .filter((entry): entry is { account: AccountHistory; latest: DailyStats } =>
      Boolean(entry.latest),
    );
  const visible = latestStats.filter((entry) => !entry.account.isFollowerCountHidden);

  const totalFollowers = visible.reduce((sum, { latest }) => sum + latest.followers, 0);
  const tier = tierForFollowers(totalFollowers);
  const overallEngagementBp = engagementRateBp({
    followers: totalFollowers,
    posts: visible.reduce((sum, { latest }) => sum + latest.posts30d, 0),
    likes: visible.reduce((sum, { latest }) => sum + latest.likes30d, 0),
    comments: visible.reduce((sum, { latest }) => sum + latest.comments30d, 0),
  });
  const tierAverageBp = TIER_AVERAGE_ENGAGEMENT_BP[tier];
  const engagementScore =
    visible.length === 0 ? NEUTRAL_SCORE : clampScore((overallEngagementBp / tierAverageBp) * 50);

  const postsLast30Days = latestStats.reduce((sum, { latest }) => sum + latest.posts30d, 0);
  const consistencyScore = clampScore(
    (postsLast30Days / CONSISTENCY_TARGET_POSTS_PER_MONTH) * MAX_SCORE,
  );

  const growth = growthPercent(input.accounts);
  const growthScore =
    growth === null
      ? NEUTRAL_SCORE
      : clampScore(NEUTRAL_SCORE + (growth / GROWTH_FULL_SCORE_PERCENT) * NEUTRAL_SCORE);

  const cleared = new Set(input.clearedFlagTypes ?? []);
  const flags = detectAuthenticityFlags(input.accounts, overallEngagementBp, tier).filter(
    (flag) => !cleared.has(flag.type),
  );
  const authenticityScore = clampScore(
    MAX_SCORE - flags.reduce((sum, flag) => sum + AUTHENTICITY_RULES.penaltyPerFlag[flag.type], 0),
  );
  const completenessScore = clampScore(input.completenessPercent);

  const score = clampScore(
    engagementScore * SCORE_WEIGHTS.engagement +
      consistencyScore * SCORE_WEIGHTS.consistency +
      growthScore * SCORE_WEIGHTS.growth +
      authenticityScore * SCORE_WEIGHTS.authenticity +
      completenessScore * SCORE_WEIGHTS.completeness,
  );

  return {
    score,
    weightsVersion: SCORE_WEIGHTS_VERSION,
    tier,
    totalFollowers,
    engagementRateBp: overallEngagementBp,
    components: {
      engagement: { score: engagementScore, tierAverageBp },
      consistency: { score: consistencyScore, postsLast30Days },
      growth: {
        score: growthScore,
        growthPercent: growth === null ? null : Math.round(growth * 10) / 10,
      },
      authenticity: { score: authenticityScore, flags },
      completeness: { score: completenessScore },
    },
  };
}
