/** Rating rules (FR-10, UC-R7). Pure: no I/O. */
import type { CollabSide } from './chat';

const DAY_MS = 86_400_000;
const TENTHS = 10;

export const MIN_STARS = 1;
export const MAX_STARS = 5;

/**
 * FR-10.1: the fixed criteria, by who is rating. A brand rates the creator's work; a
 * creator rates how the brand worked with them.
 */
export const RATING_CRITERIA = {
  BRAND: ['contentQuality', 'onTime', 'communication'],
  CREATOR: ['clearBrief', 'paidOnTime', 'communication'],
} as const satisfies Record<CollabSide, readonly string[]>;

export type RatingCriterion = (typeof RATING_CRITERIA)[CollabSide][number];

/** Scores keyed by criterion, 1-5 each. */
export type RatingScores = Readonly<Partial<Record<RatingCriterion, number>>>;

/** FR-10.1: every criterion for this side is present and a whole number of stars. */
export function hasValidScores(raterSide: CollabSide, scores: RatingScores): boolean {
  const criteria: readonly RatingCriterion[] = RATING_CRITERIA[raterSide];
  const keys = Object.keys(scores);
  return (
    keys.length === criteria.length &&
    criteria.every((criterion) => {
      const stars = scores[criterion];
      return (
        Number.isInteger(stars) && stars !== undefined && stars >= MIN_STARS && stars <= MAX_STARS
      );
    })
  );
}

/** The mean score in tenths (4.33 → 43), so averages stay integers. */
export function averageTenths(scores: RatingScores): number {
  const values = Object.values(scores).filter((value): value is number => value !== undefined);
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * TENTHS);
}

/** UC-R7: when a new rating becomes visible if the other side doesn't rate. */
export function ratingRevealDate(completedAt: Date, revealAfterDays: number): Date {
  return new Date(completedAt.getTime() + revealAfterDays * DAY_MS);
}

/** FR-10.2: a rating shows once its reveal time has come and no admin has hidden it. */
export function isRatingVisible(
  rating: { readonly visibleFrom: Date; readonly isHidden: boolean },
  now: Date,
): boolean {
  return !rating.isHidden && rating.visibleFrom.getTime() <= now.getTime();
}
