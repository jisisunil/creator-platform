/** Scoring module: content score, authenticity flags and search columns (FR-4). */
import type { CreatorProfileRecord } from '@/adapters/db/creator-repository';
import type { Repositories } from '@/adapters/db/repositories';
import { GROWTH_WINDOW_DAYS } from '@/config/score';
import { profileCompletenessPercent } from '@/domain/creators';
import { computeContentScore, type ScoreBreakdown } from '@/domain/score';
import type { ServiceContext } from '../context';

const DAY_MS = 86_400_000;
/** A little more history than the growth window, so the window always has a baseline. */
const HISTORY_DAYS = GROWTH_WINDOW_DAYS + 30;

/** Completeness inputs from a stored profile (FR-4.2). */
export function completenessOf(profile: CreatorProfileRecord): number {
  return profileCompletenessPercent({
    displayName: profile.displayName,
    bio: profile.bio,
    hasPhoto: profile.photoKey !== null,
    city: profile.city,
    stateCode: profile.stateCode,
    languageCount: profile.languageCodes.length,
    categoryCount: profile.categorySlugs.length,
    rateCardCount: profile.rateCard.length,
    portfolioCount: profile.portfolio.length,
    connectedAccountCount: profile.accounts.length,
  });
}

/**
 * FR-4.1: recomputes a creator's score after a refresh or profile change, stores it with
 * its weights version, raises new authenticity flags (UC-M2 queue) and updates the
 * denormalised search columns. Creators without an active account leave search (UC-C5).
 */
export async function recomputeCreatorScore(
  ctx: Pick<ServiceContext, 'transaction' | 'clock'>,
  creatorId: string,
): Promise<ScoreBreakdown | null> {
  const now = ctx.clock.now();
  return ctx.transaction(async (repos: Repositories) => {
    const profile = await repos.creators.findById(creatorId);
    if (!profile) return null;
    const history = await repos.socialAccounts.historyForCreator(
      creatorId,
      new Date(now.getTime() - HISTORY_DAYS * DAY_MS),
    );
    const breakdown = computeContentScore({
      accounts: history,
      completenessPercent: completenessOf(profile),
    });
    await repos.scores.addResult(creatorId, breakdown, now);
    await repos.scores.raiseFlags(creatorId, breakdown.components.authenticity.flags);

    const activeAccounts = profile.accounts.filter((account) => account.status === 'ACTIVE');
    const lastRefreshes = activeAccounts
      .map((account) => account.lastRefreshedAt?.getTime() ?? 0)
      .filter((time) => time > 0);
    await repos.creators.updateDerived(creatorId, {
      isSearchable: activeAccounts.length > 0 && profile.displayName.trim().length > 0,
      isVerified: activeAccounts.some((account) => account.isVerified),
      tier: activeAccounts.length > 0 ? breakdown.tier : null,
      totalFollowers: breakdown.totalFollowers,
      engagementRateBp: breakdown.engagementRateBp,
      currentScore: breakdown.score,
      scoreUpdatedAt: now,
      lastRefreshedAt: lastRefreshes.length > 0 ? new Date(Math.min(...lastRefreshes)) : null,
    });
    return breakdown;
  });
}
