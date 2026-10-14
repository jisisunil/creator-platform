import { z } from 'zod';
import { RATING_RULES, REPORT_REASON_MAX } from '@/config/collaboration';
import type { RatingCriterion, RatingScores } from '@/domain/ratings';

/** Rating form schemas (FR-10), shared by the browser and server actions. */

const id = z.string().min(1).max(64);
const REPORT_REASON_MIN = 10;

/** One criterion's stars from a radio group; the service checks which criteria are needed. */
const stars = z
  .string()
  .regex(/^[1-5]$/, 'rating.allCriteria')
  .transform(Number)
  .optional();

export const ratingFormSchema = z.object({
  dealId: id,
  contentQuality: stars,
  onTime: stars,
  communication: stars,
  clearBrief: stars,
  paidOnTime: stars,
  comment: z.string().trim().max(RATING_RULES.commentMax, 'validation.tooLong'),
});

/** The criteria that were answered, as scores. */
export function scoresFrom(input: z.infer<typeof ratingFormSchema>): RatingScores {
  const criteria: readonly RatingCriterion[] = [
    'contentQuality',
    'onTime',
    'communication',
    'clearBrief',
    'paidOnTime',
  ];
  return Object.fromEntries(
    criteria.flatMap((criterion) => {
      const value = input[criterion];
      return value === undefined ? [] : [[criterion, value]];
    }),
  );
}

export const reportRatingSchema = z.object({
  ratingId: id,
  reason: z
    .string()
    .trim()
    .min(REPORT_REASON_MIN, 'chat.reasonTooShort')
    .max(REPORT_REASON_MAX, 'validation.tooLong'),
});
