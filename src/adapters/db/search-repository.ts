import { AUDIENCE_AGE_MIN_PERMILLE, AUDIENCE_GENDER_MIN_PERMILLE } from '@/config/search';
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
  if (filters.city) and.push({ city: { equals: filters.city, mode: 'insensitive' } });
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

// Every sort ends with id so pages are stable when values tie.
const ORDER_BY: Record<SearchSort, Prisma.CreatorProfileOrderByWithRelationInput[]> = {
  score: [{ currentScore: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
  engagement: [{ engagementRateBp: 'desc' }, { id: 'asc' }],
  followers: [{ totalFollowers: 'desc' }, { id: 'asc' }],
  growth: [{ growth90dBp: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
};

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

export type SearchRepository = ReturnType<typeof createSearchRepository>;

/** Creator search for brands (FR-5). Reads only denormalised, indexed columns (ADR-005). */
export function createSearchRepository(db: DbClient) {
  return {
    async search(
      filters: SearchFilters,
      sort: SearchSort,
      page: { offset: number; limit: number },
    ): Promise<{ items: CreatorSearchResult[]; total: number }> {
      const where = whereForFilters(filters);
      const [rows, total] = await Promise.all([
        db.creatorProfile.findMany({
          where,
          orderBy: ORDER_BY[sort],
          skip: page.offset,
          take: page.limit,
          select: RESULT_SELECT,
        }),
        db.creatorProfile.count({ where }),
      ]);
      return { items: rows.map(toResult), total };
    },

    count: (filters: SearchFilters): Promise<number> =>
      db.creatorProfile.count({ where: whereForFilters(filters) }),

    /** Search-result cards for specific creators, in the order asked (compare, shortlists). */
    async findResultsByIds(ids: readonly string[]): Promise<CreatorSearchResult[]> {
      const rows = await db.creatorProfile.findMany({
        where: { id: { in: [...ids] } },
        select: RESULT_SELECT,
      });
      const byId = new Map(rows.map((row) => [row.id, toResult(row)]));
      return ids
        .map((id) => byId.get(id))
        .filter((row): row is CreatorSearchResult => Boolean(row));
    },
  };
}
