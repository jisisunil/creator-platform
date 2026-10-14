/** Discovery module: brand search, saved searches, profile views and compare (FR-5, FR-6.2, UC-D). */
import type { BrandMembership } from '@/adapters/db/brand-repository';
import type { Repositories } from '@/adapters/db/repositories';
import type { CreatorSearchResult } from '@/adapters/db/search-repository';
import { CATEGORY_SLUGS_BY_COUNTRY } from '@/config/categories';
import { CONTENT_LANGUAGES } from '@/config/languages';
import { REGION_CODES_BY_COUNTRY } from '@/config/regions';
import {
  COMPARE_MAX,
  COMPARE_MIN,
  MAX_SAVED_SEARCHES_PER_BRAND,
  MAX_SEARCH_SUGGESTIONS,
  SEARCH_FILTERS_VERSION,
  SEARCH_MAX_PAGE,
  SEARCH_PAGE_SIZE,
} from '@/config/search';
import { engagementRateBp } from '@/domain/creators';
import {
  notAllowed,
  notFound,
  planLimitReached,
  rateLimited,
  validationFailed,
} from '@/domain/errors';
import {
  pruneUnknownFilterValues,
  type SearchFilters,
  type SearchSort,
  type WideningKind,
  wideningsFor,
} from '@/domain/search';
import type { RequestInfo, ServiceContext } from '../context';

export type { CreatorSearchResult } from '@/adapters/db/search-repository';
import { getPublicProfile, type PublicCreatorProfile } from '../creators';
import { consumeRateLimit } from '../security';

const HOUR_MS = 3_600_000;

/** The signed-in user's brand, or NOT_ALLOWED for anyone without one (SR-5). */
export async function requireBrandMembership(
  repos: Repositories,
  userId: string,
): Promise<BrandMembership> {
  const membership = await repos.brands.findMembership(userId);
  if (!membership) throw notAllowed();
  return membership;
}

export interface SearchPage {
  readonly items: readonly CreatorSearchResult[];
  readonly total: number;
  readonly page: number;
  readonly pageCount: number;
  /** FR-5.3: when nothing matched, wider searches that would find creators. */
  readonly suggestions: readonly { kind: WideningKind; filters: SearchFilters; total: number }[];
}

/**
 * FR-5.1–5.3 / UC-D1: filtered, sorted, paginated search over searchable creators in the
 * brand's country. Pages are capped; an empty result comes with "widen your search" ideas.
 * Rate-limited per user (SR-11, SEC-3).
 */
export async function searchCreators(
  ctx: ServiceContext,
  input: { userId: string; filters: SearchFilters; sort: SearchSort; page: number },
): Promise<SearchPage> {
  await consumeRateLimit(ctx.repos, ctx.clock.now(), 'searchPerUser', input.userId);
  const membership = await requireBrandMembership(ctx.repos, input.userId);
  const filters: SearchFilters = { ...input.filters, countryCode: membership.countryCode };
  const page = Math.min(Math.max(1, Math.floor(input.page)), SEARCH_MAX_PAGE);

  const result = await ctx.repos.search.search(filters, input.sort, {
    offset: (page - 1) * SEARCH_PAGE_SIZE,
    limit: SEARCH_PAGE_SIZE,
  });
  const pageCount = Math.min(Math.ceil(result.total / SEARCH_PAGE_SIZE), SEARCH_MAX_PAGE);

  const suggestions: SearchPage['suggestions'][number][] = [];
  if (result.total === 0) {
    for (const widening of wideningsFor(filters)) {
      if (suggestions.length >= MAX_SEARCH_SUGGESTIONS) break;
      const total = await ctx.repos.search.count(widening.filters);
      if (total > 0) suggestions.push({ ...widening, total });
    }
  }
  return { items: result.items, total: result.total, page, pageCount, suggestions };
}

/**
 * UC-D2 / SEC-3: a creator profile opened by a brand. Each view is recorded (creator
 * analytics) and capped per hour by the brand's plan, so the database can't be scraped.
 */
export async function viewCreatorProfile(
  ctx: ServiceContext,
  input: { userId: string; slug: string },
): Promise<PublicCreatorProfile | null> {
  const membership = await requireBrandMembership(ctx.repos, input.userId);
  const now = ctx.clock.now();
  const viewsLastHour = await ctx.repos.discovery.countViewsByBrandSince(
    membership.brandId,
    new Date(now.getTime() - HOUR_MS),
  );
  if (viewsLastHour >= membership.plan.profileViewsPerHour) throw rateLimited();

  const profile = await getPublicProfile(ctx, input.slug);
  if (!profile) return null;
  await ctx.repos.discovery.recordProfileView(profile.id, membership.brandId, now);
  return profile;
}

/** SEC-3: public (signed-out) profile pages are rate-limited per IP. */
export async function viewPublicProfile(
  ctx: ServiceContext,
  slug: string,
  request: RequestInfo,
): Promise<PublicCreatorProfile | null> {
  await consumeRateLimit(ctx.repos, ctx.clock.now(), 'publicProfilePerIp', request.ipAddress);
  return getPublicProfile(ctx, slug);
}

/** FR-5.4: saves the current filters under a name (plans with saved searches only). */
export async function saveSearch(
  ctx: ServiceContext,
  input: { userId: string; name: string; filters: SearchFilters },
): Promise<string> {
  const membership = await requireBrandMembership(ctx.repos, input.userId);
  if (!membership.plan.canSaveSearch) throw planLimitReached('featureNotIncluded');
  const existing = await ctx.repos.discovery.countSavedSearches(membership.brandId);
  if (existing >= MAX_SAVED_SEARCHES_PER_BRAND) throw validationFailed({ name: 'search.tooMany' });
  const { countryCode: _country, ...filters } = input.filters;
  return ctx.repos.discovery.saveSearch({
    brandId: membership.brandId,
    createdByUserId: input.userId,
    name: input.name,
    filters,
    filtersVersion: SEARCH_FILTERS_VERSION,
  });
}

/** FR-5.4: the brand's saved searches. */
export async function listSavedSearches(ctx: ServiceContext, userId: string) {
  const membership = await requireBrandMembership(ctx.repos, userId);
  return ctx.repos.discovery.listSavedSearches(membership.brandId);
}

/**
 * UC-D5: loads a saved search to rerun. Values that no longer exist (a removed category or
 * language) are dropped, and the caller is told so it can explain.
 */
export async function loadSavedSearch(
  ctx: ServiceContext,
  input: { userId: string; savedSearchId: string },
  parseFilters: (raw: unknown) => SearchFilters,
): Promise<{ name: string; filters: SearchFilters; hasDroppedValues: boolean }> {
  const membership = await requireBrandMembership(ctx.repos, input.userId);
  const saved = await ctx.repos.discovery.findSavedSearch(input.savedSearchId, membership.brandId);
  if (!saved) throw notFound();
  const pruned = pruneUnknownFilterValues(parseFilters(saved.filters), {
    categories: new Set(CATEGORY_SLUGS_BY_COUNTRY[membership.countryCode] ?? []),
    languages: new Set(CONTENT_LANGUAGES.map((language) => language.code)),
    stateCodes: new Set(REGION_CODES_BY_COUNTRY[membership.countryCode] ?? []),
  });
  return { name: saved.name, ...pruned };
}

/** FR-5.4: deletes a saved search of this brand. */
export async function deleteSavedSearch(
  ctx: ServiceContext,
  input: { userId: string; savedSearchId: string },
): Promise<void> {
  const membership = await requireBrandMembership(ctx.repos, input.userId);
  if (!(await ctx.repos.discovery.deleteSavedSearch(input.savedSearchId, membership.brandId))) {
    throw notFound();
  }
}

export interface PlatformComparison {
  readonly platform: 'YOUTUBE' | 'INSTAGRAM';
  readonly handle: string;
  readonly isVerified: boolean;
  /** Null when the platform hides the count (UC-C2). */
  readonly followers: number | null;
  readonly postsLast30Days: number;
  readonly engagementRateBp: number | null;
  readonly views30d: number | null;
}

export interface CreatorComparison {
  readonly creator: CreatorSearchResult;
  readonly platforms: readonly PlatformComparison[];
  /** Empty when the creator hasn't shared audience data: shown as "not shared" (UC-D4). */
  readonly audience: readonly { dimension: string; bucket: string; sharePermille: number }[];
}

/**
 * FR-6.2 / UC-D4: 2–4 creators side by side, with figures per platform (different
 * platforms aren't mixed) and audience data where shared.
 */
export async function compareCreators(
  ctx: ServiceContext,
  input: { userId: string; creatorIds: readonly string[] },
): Promise<CreatorComparison[]> {
  const membership = await requireBrandMembership(ctx.repos, input.userId);
  if (!membership.plan.canCompare) throw planLimitReached('featureNotIncluded');
  const ids = [...new Set(input.creatorIds)];
  if (ids.length < COMPARE_MIN || ids.length > COMPARE_MAX) {
    throw validationFailed({ creatorIds: 'search.compareCount' });
  }
  const cards = (await ctx.repos.search.findResultsByIds(ids)).filter(
    (card) => card.countryCode === membership.countryCode,
  );
  const accounts = await ctx.repos.socialAccounts.latestStatsForCreators(cards.map((c) => c.id));

  return cards.map((creator) => {
    const own = accounts.filter((account) => account.creatorId === creator.id);
    return {
      creator,
      platforms: own.map((account) => {
        const latest = account.snapshots[0];
        const followers = account.isFollowerCountHidden ? null : (latest?.followers ?? 0);
        return {
          platform: account.platform,
          handle: account.handle,
          isVerified: account.isVerified,
          followers,
          postsLast30Days: latest?.posts30d ?? 0,
          views30d: latest?.views30d ?? null,
          engagementRateBp:
            latest && followers !== null
              ? engagementRateBp({
                  followers,
                  posts: latest.posts30d,
                  likes: latest.likes30d,
                  comments: latest.comments30d,
                })
              : null,
        };
      }),
      audience: own.flatMap((account) => account.audience),
    };
  });
}
