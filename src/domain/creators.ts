import { type CreatorTier, TIER_LOWER_BOUNDS } from '@/config/score';

/** FR-4.4: the tier for a follower count. */
export function tierForFollowers(followers: number): CreatorTier {
  if (followers >= TIER_LOWER_BOUNDS.MEGA) return 'MEGA';
  if (followers >= TIER_LOWER_BOUNDS.MACRO) return 'MACRO';
  if (followers >= TIER_LOWER_BOUNDS.MID) return 'MID';
  if (followers >= TIER_LOWER_BOUNDS.MICRO) return 'MICRO';
  return 'NANO';
}

const BASIS_POINTS = 10_000;

/**
 * Engagement rate in basis points: average interactions (likes + comments) per post as a
 * share of followers. Zero when there are no posts or followers to divide by.
 */
export function engagementRateBp(stats: {
  readonly followers: number;
  readonly posts: number;
  readonly likes: number;
  readonly comments: number;
}): number {
  if (stats.posts <= 0 || stats.followers <= 0) return 0;
  const interactionsPerPost = (stats.likes + stats.comments) / stats.posts;
  return Math.round((interactionsPerPost / stats.followers) * BASIS_POINTS);
}

/** Profile fields that count towards completeness (FR-4.2). */
export interface ProfileForCompleteness {
  readonly displayName: string;
  readonly bio: string;
  readonly hasPhoto: boolean;
  readonly city: string;
  readonly stateCode: string;
  readonly languageCount: number;
  readonly categoryCount: number;
  readonly rateCardCount: number;
  readonly portfolioCount: number;
  readonly connectedAccountCount: number;
}

export type ProfileField =
  | 'displayName'
  | 'bio'
  | 'photo'
  | 'location'
  | 'languages'
  | 'categories'
  | 'rateCard'
  | 'portfolio'
  | 'connectedAccount';

const MIN_USEFUL_BIO_LENGTH = 30;

/** Which profile fields are still missing, in the order the profile editor shows them. */
export function missingProfileFields(profile: ProfileForCompleteness): ProfileField[] {
  const checks: [ProfileField, boolean][] = [
    ['displayName', profile.displayName.trim().length > 0],
    ['bio', profile.bio.trim().length >= MIN_USEFUL_BIO_LENGTH],
    ['photo', profile.hasPhoto],
    ['location', profile.city.trim().length > 0 && profile.stateCode.length > 0],
    ['languages', profile.languageCount > 0],
    ['categories', profile.categoryCount > 0],
    ['rateCard', profile.rateCardCount > 0],
    ['portfolio', profile.portfolioCount > 0],
    ['connectedAccount', profile.connectedAccountCount > 0],
  ];
  return checks.filter(([, isDone]) => !isDone).map(([field]) => field);
}

/** Profile completeness 0–100: the share of fields filled in. */
export function profileCompletenessPercent(profile: ProfileForCompleteness): number {
  const totalFields = 9;
  const missing = missingProfileFields(profile).length;
  return Math.round(((totalFields - missing) / totalFields) * 100);
}

const MAX_SLUG_BASE_LENGTH = 40;

/** URL-safe slug base from a display name; non-Latin names fall back to "creator". */
export function slugBaseFrom(displayName: string): string {
  const base = displayName
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_BASE_LENGTH)
    .replace(/-+$/g, '');
  return base || 'creator';
}
