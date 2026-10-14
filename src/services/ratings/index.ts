/** Ratings module: both sides rate a completed deal; reputations on profiles (FR-10, UC-R7). */
import type { RatingRecord, Reputation } from '@/adapters/db/rating-repository';
import { RATING_RULES } from '@/config/collaboration';
import { otherSide } from '@/domain/chat';
import { containsProfanity, findContactDetails } from '@/domain/content-safety';
import { conflict, invalidState, notAllowed, notFound, validationFailed } from '@/domain/errors';
import {
  averageTenths,
  hasValidScores,
  isRatingVisible,
  type RatingScores,
  ratingRevealDate,
} from '@/domain/ratings';
import { getLogger } from '@/lib/logger';
import type { ServiceContext } from '../context';
import { requireDealParticipant } from '../deals';
import { consumeRateLimit } from '../security';

export type { RatingRecord, Reputation } from '@/adapters/db/rating-repository';

const logger = getLogger('ratings');

/**
 * FR-10.1 / FR-10.2: rates the other side of a completed deal, once. The rating stays
 * hidden until the other side rates too (then both show at once) or 14 days pass after
 * completion (UC-R7). Comments can't carry contact details or profanity.
 */
export async function submitRating(
  ctx: ServiceContext,
  input: {
    readonly userId: string;
    readonly dealId: string;
    readonly scores: RatingScores;
    readonly comment: string;
  },
): Promise<void> {
  const now = ctx.clock.now();
  const { deal, side } = await requireDealParticipant(ctx.repos, input.userId, input.dealId);
  if (deal.status !== 'COMPLETED' || !deal.completedAt) throw invalidState();
  if (!hasValidScores(side, input.scores)) throw validationFailed({ scores: 'rating.allCriteria' });
  const comment = input.comment.trim();
  if (containsProfanity(comment)) throw validationFailed({ comment: 'profile.noProfanity' });
  if (findContactDetails(comment).length > 0) {
    throw validationFailed({ comment: 'profile.noContactDetails' });
  }
  const completedAt = deal.completedAt;

  await ctx.transaction(async (repos) => {
    const existing = await repos.ratings.listForDeal(deal.id);
    if (existing.some((rating) => rating.raterSide === side)) throw conflict();
    const hasOtherRating = existing.some((rating) => rating.raterSide === otherSide(side));
    await repos.ratings.create({
      dealId: deal.id,
      raterSide: side,
      raterUserId: input.userId,
      scores: input.scores,
      averageTenths: averageTenths(input.scores),
      comment: comment || null,
      visibleFrom: hasOtherRating
        ? now
        : ratingRevealDate(completedAt, RATING_RULES.revealAfterDays),
      createdAt: now,
    });
    if (hasOtherRating) await repos.ratings.revealDeal(deal.id, now);
  });
  logger.info({ action: 'rating.submitted', dealId: deal.id, side }, 'rating submitted');
}

export interface DealRatings {
  readonly canRate: boolean;
  readonly mine: RatingRecord | null;
  /** The other side's rating of the viewer, once visible. */
  readonly theirs: RatingRecord | null;
  /** When the viewer's own rating will show if the other side doesn't rate (UC-R7). */
  readonly revealAt: Date | null;
}

/** FR-10.2: the ratings on a deal as one participant may see them. */
export async function getDealRatings(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string },
): Promise<DealRatings> {
  const now = ctx.clock.now();
  const { deal, side } = await requireDealParticipant(ctx.repos, input.userId, input.dealId);
  const ratings = await ctx.repos.ratings.listForDeal(deal.id);
  const mine = ratings.find((rating) => rating.raterSide === side) ?? null;
  const theirs = ratings.find((rating) => rating.raterSide !== side) ?? null;
  return {
    canRate: deal.status === 'COMPLETED' && mine === null,
    mine,
    theirs: theirs && isRatingVisible(theirs, now) ? theirs : null,
    revealAt: mine && !isRatingVisible(mine, now) ? mine.visibleFrom : null,
  };
}

/** FR-10.2: a creator's reputation from brands' visible ratings. */
export async function getCreatorReputation(
  ctx: ServiceContext,
  creatorId: string,
): Promise<Reputation> {
  return ctx.repos.ratings.reputation({ creatorId }, ctx.clock.now(), RATING_RULES.recentReviews);
}

/** FR-10.2: a brand's reputation from creators' visible ratings, shown with its requests. */
export async function getBrandReputation(
  ctx: ServiceContext,
  brandId: string,
): Promise<Reputation> {
  return ctx.repos.ratings.reputation({ brandId }, ctx.clock.now(), RATING_RULES.recentReviews);
}

/**
 * FR-10.3 / UC-R7: the rated side reports a review as unfair (for example retaliation);
 * an admin decides whether to hide it (phase g). One open report per rating and person.
 */
export async function reportRating(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly ratingId: string; readonly reason: string },
): Promise<void> {
  await consumeRateLimit(ctx.repos, ctx.clock.now(), 'reportsPerUser', input.userId);
  const rating = await ctx.repos.ratings.findById(input.ratingId);
  if (!rating) throw notFound();
  const { side } = await requireDealParticipant(ctx.repos, input.userId, rating.dealId);
  if (side === rating.raterSide) throw notAllowed();
  if (!isRatingVisible(rating, ctx.clock.now())) throw notFound();
  if (await ctx.repos.reports.hasOpenReport(input.userId, 'RATING', rating.id)) return;
  await ctx.repos.reports.create({
    reporterUserId: input.userId,
    targetType: 'RATING',
    targetId: rating.id,
    threadId: null,
    reason: input.reason,
  });
  logger.info({ action: 'report.filed', targetType: 'RATING' }, 'rating reported');
}
