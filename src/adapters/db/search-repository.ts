import {
  AUDIENCE_AGE_MIN_PERMILLE,
  AUDIENCE_GENDER_MIN_PERMILLE,
  SEARCH_COUNT_CAP,
} from '@/config/search';
import type { CreatorTier } from '@/config/score';
import type { SearchFilters, SearchSort } from '@/domain/search';
import type { Prisma } from '@/generated/prisma/client';
import type { DbClient } from './db-client';

/** One search result: public profile fields only (SR-12). */
export interface CreatorSearchResult {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly photoKey: string | null;
  readonly city: string;
  readonly stateCode: string;
  readonly countryCode: string;
  readonly tier: CreatorTier | null;
  readonly totalFollowers: number;
  readonly engagementRateBp: number;
  readonly currentScore: number | null;
  readonly growth90dBp: number | null;
  readonly isVerified: boolean;
  readonly isOpenToCollaborations: boolean;
  readonly categorySlugs: readonly string[];
  readonly platforms: readonly ('YOUTUBE' | 'INSTAGRAM')[];
}

const BASIS_POINTS_PER_PERCENT = 100;

/** Prisma filter for FR-5.1. Only searchable creators of active accounts ever match. */
export function whereForFilters(filters: SearchFilters): Prisma.CreatorProfileWhereInput {
  const and: Prisma.CreatorProfileWhereInput[] = [
    { isSearchable: true, user: { status: 'ACTIVE' } },
  ];
  if (filters.countryCode) and.push({ countryCode: filters.countryCode });
  if (filters.stateCode) and.push({ stateCode: filters.stateCode });
  // city is citext, so plain equality ignores case and can use the location index.
  if (filters.city) and.push({ city: filters.city });
  if (filters.query) {
    and.push({
      OR: [
        { displayName: { contains: filters.query, mode: 'insensitive' } },
        { bio: { contains: filters.query, mode: 'insensitive' } },
      ],
    });
  }
  if (filters.platforms?.length) {
    and.push({
      socialAccounts: { some: { platform: { in: [...filters.platforms] }, status: 'ACTIVE' } },
    });
  }
  if (filters.categories?.length) {
    and.push({ categories: { some: { category: { slug: { in: [...filters.categories] } } } } });
  }
  if (filters.languages?.length) {
    and.push({ languages: { some: { languageCode: { in: [...filters.languages] } } } });
  }
  if (filters.tiers?.length) and.push({ tier: { in: [...filters.tiers] } });
  if (filters.minFollowers !== undefined)
    and.push({ totalFollowers: { gte: filters.minFollowers } });
  if (filters.maxFollowers !== undefined)
    and.push({ totalFollowers: { lte: filters.maxFollowers } });
  if (filters.minEngagementPercent !== undefined) {
    and.push({
      engagementRateBp: {
        gte: Math.round(filters.minEngagementPercent * BASIS_POINTS_PER_PERCENT),
      },
    });
  }
  if (filters.minScore !== undefined) and.push({ currentScore: { gte: filters.minScore } });
  if (filters.isVerifiedOnly) and.push({ isVerified: true });
  if (filters.isOpenOnly) and.push({ isOpenToCollaborations: true });
  if (filters.audienceGender) {
    and.push({
      socialAccounts: {
        some: {
          audience: {
            some: {
              dimension: 'GENDER',
              bucket: filters.audienceGender,
              sharePermille: { gte: AUDIENCE_GENDER_MIN_PERMILLE },
            },
          },
        },
      },
    });
  }
  if (filters.audienceAge) {
    and.push({
      socialAccounts: {
        some: {
          audience: {
            some: {
              dimension: 'AGE',
              bucket: filters.audienceAge,
              sharePermille: { gte: AUDIENCE_AGE_MIN_PERMILLE },
            },
          },
        },
      },
    });
  }
  return { AND: and };
}

// Every sort ends with id so pages are stable when values tie. Each order matches one
// "(countryCode, isSearchable, <column> DESC, id)" index exactly, so the first page is read
// straight from the index instead of sorting every match (NFR-1, ADR-005). Searchable
// creators always have a score; creators without 90 days of history have no growth and
// come last (that index is DESC NULLS LAST, created in the migration).
const ORDER_BY: Record<SearchSort, Prisma.CreatorProfileOrderByWithRelationInput[]> = {
  score: [{ currentScore: 'desc' }, { id: 'asc' }],
  engagement: [{ engagementRateBp: 'desc' }, { id: 'asc' }],
  followers: [{ totalFollowers: 'desc' }, { id: 'asc' }],
  growth: [{ growth90dBp: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
};

/** A number of matching creators, counted up to SEARCH_COUNT_CAP. */
export interface CreatorCount {
  readonly total: number;
  /** True when there are more than `total` matches (shown as "1,200+"). */
  readonly isTotalCapped: boolean;
}

/**
 * Ids of the creators matching `where`, in result order, up to one past SEARCH_COUNT_CAP.
 * Ordering by the search sort lets PostgreSQL use the matching sort index and stop early on
 * broad searches; Prisma orders any `take` query, and ordering by id instead made selective
 * searches walk the whole table (NFR-1 load test, ADR-005).
 */
async function matchingIds(
  db: DbClient,
  where: Prisma.CreatorProfileWhereInput,
  sort: SearchSort,
): Promise<string[]> {
  const rows = await db.creatorProfile.findMany({
    where,
    orderBy: ORDER_BY[sort],
    take: SEARCH_COUNT_CAP + 1,
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

function countOf(ids: readonly string[]): CreatorCount {
  return ids.length > SEARCH_COUNT_CAP
    ? { total: SEARCH_COUNT_CAP, isTotalCapped: true }
    : { total: ids.length, isTotalCapped: false };
}

const RESULT_SELECT = {
  id: true,
  slug: true,
  displayName: true,
  photoKey: true,
  city: true,
  stateCode: true,
  countryCode: true,
  tier: true,
  totalFollowers: true,
  engagementRateBp: true,
  currentScore: true,
  growth90dBp: true,
  isVerified: true,
  isOpenToCollaborations: true,
  categories: { select: { category: { select: { slug: true } } } },
  socialAccounts: { where: { status: 'ACTIVE' as const }, select: { platform: true } },
} as const;

type ResultRow = Prisma.CreatorProfileGetPayload<{ select: typeof RESULT_SELECT }>;

function toResult(row: ResultRow): CreatorSearchResult {
  const { categories, socialAccounts, ...profile } = row;
  return {
    ...profile,
    categorySlugs: categories.map((entry) => entry.category.slug),
    platforms: [...new Set(socialAccounts.map((account) => account.platform))],
  };
}

async function findResultsByIds(
  db: DbClient,
  ids: readonly string[],
): Promise<CreatorSearchResult[]> {
  if (ids.length === 0) return [];
  const rows = await db.creatorProfile.findMany({
    where: { id: { in: [...ids] } },
    select: RESULT_SELECT,
  });
  const byId = new Map(rows.map((row) => [row.id, toResult(row)]));
  return ids.map((id) => byId.get(id)).filter((row): row is CreatorSearchResult => Boolean(row));
}

export type SearchRepository = ReturnType<typeof createSearchRepository>;

/** Creator search for brands (FR-5). Reads only denormalised, indexed columns (ADR-005). */
export function createSearchRepository(db: DbClient) {
  return {
    /**
     * One ordered pass finds every reachable match (the cap covers SEARCH_MAX_PAGE pages);
     * the requested page is then loaded by primary key. Counting and paging separately cost
     * seconds per search at 500k creators.
     */
    async search(
      filters: SearchFilters,
      sort: SearchSort,
      page: { offset: number; limit: number },
    ): Promise<{ items: CreatorSearchResult[] } & CreatorCount> {
      const ids = await matchingIds(db, whereForFilters(filters), sort);
      const pageIds = ids.slice(0, SEARCH_COUNT_CAP).slice(page.offset, page.offset + page.limit);
      return { items: await findResultsByIds(db, pageIds), ...countOf(ids) };
    },

    count: async (filters: SearchFilters): Promise<CreatorCount> =>
      countOf(await matchingIds(db, whereForFilters(filters), 'score')),

    /** Search-result cards for specific creators, in the order asked (compare, shortlists). */
    findResultsByIds: (ids: readonly string[]): Promise<CreatorSearchResult[]> =>
      findResultsByIds(db, ids),
  };
}
