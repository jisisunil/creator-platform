import type { CreatorTier } from '@/config/score';
import type { Prisma } from '@/generated/prisma/client';
import type { DbClient } from './db-client';

export type Deliverable = 'REEL' | 'STORY' | 'VIDEO' | 'POST';

export interface RateCardEntry {
  readonly deliverable: Deliverable;
  readonly amountMinor: number;
  readonly currency: string;
}

export interface PortfolioEntry {
  readonly id: string;
  readonly url: string;
  readonly brandName: string;
  readonly collaboratedOn: Date;
}

export interface ConnectedAccountSummary {
  readonly id: string;
  readonly platform: 'YOUTUBE' | 'INSTAGRAM';
  readonly handle: string;
  readonly displayName: string;
  readonly isVerified: boolean;
  readonly status: 'ACTIVE' | 'TOKEN_REVOKED' | 'PRIVATE' | 'DELETED';
  readonly lastRefreshedAt: Date | null;
  readonly isFollowerCountHidden: boolean;
}

/** Everything the creator's own profile editor and dashboard show. */
export interface CreatorProfileRecord {
  readonly id: string;
  readonly userId: string;
  readonly slug: string;
  readonly displayName: string;
  readonly bio: string;
  readonly photoKey: string | null;
  readonly city: string;
  readonly stateCode: string;
  readonly countryCode: string;
  readonly isOpenToCollaborations: boolean;
  readonly isSearchable: boolean;
  readonly isVerified: boolean;
  readonly tier: CreatorTier | null;
  readonly totalFollowers: number;
  readonly engagementRateBp: number;
  readonly currentScore: number | null;
  readonly scoreUpdatedAt: Date | null;
  readonly lastRefreshedAt: Date | null;
  readonly languageCodes: readonly string[];
  readonly categorySlugs: readonly string[];
  readonly rateCard: readonly RateCardEntry[];
  readonly portfolio: readonly PortfolioEntry[];
  readonly accounts: readonly ConnectedAccountSummary[];
}

export interface ProfileFields {
  readonly displayName: string;
  readonly bio: string;
  readonly city: string;
  readonly stateCode: string;
}

const PROFILE_INCLUDE = {
  languages: { select: { languageCode: true } },
  categories: { select: { category: { select: { slug: true } } } },
  rateCard: { select: { deliverable: true, amountMinor: true, currency: true } },
  portfolio: {
    select: { id: true, url: true, brandName: true, collaboratedOn: true },
    orderBy: { collaboratedOn: 'desc' as const },
  },
  socialAccounts: {
    select: {
      id: true,
      platform: true,
      handle: true,
      displayName: true,
      isVerified: true,
      status: true,
      lastRefreshedAt: true,
      isFollowerCountHidden: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

type ProfileRow = Prisma.CreatorProfileGetPayload<{ include: typeof PROFILE_INCLUDE }>;

function toRecord(row: ProfileRow): CreatorProfileRecord {
  const { languages, categories, socialAccounts, ...profile } = row;
  return {
    ...profile,
    languageCodes: languages.map((language) => language.languageCode),
    categorySlugs: categories.map((entry) => entry.category.slug),
    accounts: socialAccounts,
  };
}

export type CreatorRepository = ReturnType<typeof createCreatorRepository>;

/** Creator profiles and their editable parts (FR-2). */
export function createCreatorRepository(db: DbClient) {
  return {
    async findByUserId(userId: string): Promise<CreatorProfileRecord | null> {
      const row = await db.creatorProfile.findUnique({
        where: { userId },
        include: PROFILE_INCLUDE,
      });
      return row ? toRecord(row) : null;
    },

    async findById(id: string): Promise<CreatorProfileRecord | null> {
      const row = await db.creatorProfile.findUnique({ where: { id }, include: PROFILE_INCLUDE });
      return row ? toRecord(row) : null;
    },

    async findBySlug(slug: string): Promise<CreatorProfileRecord | null> {
      const row = await db.creatorProfile.findUnique({ where: { slug }, include: PROFILE_INCLUDE });
      return row ? toRecord(row) : null;
    },

    async isSlugTaken(slug: string): Promise<boolean> {
      return (await db.creatorProfile.count({ where: { slug } })) > 0;
    },

    async create(data: {
      userId: string;
      slug: string;
      displayName: string;
      countryCode: string;
    }): Promise<string> {
      const created = await db.creatorProfile.create({ data, select: { id: true } });
      return created.id;
    },

    async updateFields(creatorId: string, fields: ProfileFields): Promise<void> {
      await db.creatorProfile.update({ where: { id: creatorId }, data: fields });
    },

    async setAvailability(creatorId: string, isOpen: boolean): Promise<void> {
      await db.creatorProfile.update({
        where: { id: creatorId },
        data: { isOpenToCollaborations: isOpen },
      });
    },

    async setPhotoKey(creatorId: string, photoKey: string | null): Promise<void> {
      await db.creatorProfile.update({ where: { id: creatorId }, data: { photoKey } });
    },

    async replaceLanguages(creatorId: string, languageCodes: readonly string[]): Promise<void> {
      await db.creatorLanguage.deleteMany({ where: { creatorId } });
      await db.creatorLanguage.createMany({
        data: languageCodes.map((languageCode) => ({ creatorId, languageCode })),
      });
    },

    async replaceCategories(creatorId: string, categoryIds: readonly string[]): Promise<void> {
      await db.creatorCategory.deleteMany({ where: { creatorId } });
      await db.creatorCategory.createMany({
        data: categoryIds.map((categoryId) => ({ creatorId, categoryId })),
      });
    },

    async replaceRateCard(creatorId: string, items: readonly RateCardEntry[]): Promise<void> {
      await db.rateCardItem.deleteMany({ where: { creatorId } });
      await db.rateCardItem.createMany({ data: items.map((item) => ({ ...item, creatorId })) });
    },

    async addPortfolioItem(
      creatorId: string,
      item: { url: string; brandName: string; collaboratedOn: Date },
    ): Promise<void> {
      await db.portfolioItem.create({ data: { ...item, creatorId } });
    },

    countPortfolioItems: (creatorId: string): Promise<number> =>
      db.portfolioItem.count({ where: { creatorId } }),

    /** Removes an item only if it belongs to this creator (SR-5). */
    async removePortfolioItem(creatorId: string, itemId: string): Promise<boolean> {
      const result = await db.portfolioItem.deleteMany({ where: { id: itemId, creatorId } });
      return result.count === 1;
    },

    /** Stores the recomputed search columns (ADR-005: search reads only these). */
    async updateDerived(
      creatorId: string,
      derived: {
        isSearchable: boolean;
        isVerified: boolean;
        tier: CreatorTier | null;
        totalFollowers: number;
        engagementRateBp: number;
        growth90dBp: number | null;
        currentScore: number | null;
        scoreUpdatedAt: Date | null;
        lastRefreshedAt: Date | null;
      },
    ): Promise<void> {
      await db.creatorProfile.update({ where: { id: creatorId }, data: derived });
    },

    /** Category ids for slugs in a country; unknown slugs are dropped. */
    async categoryIdsForSlugs(countryCode: string, slugs: readonly string[]): Promise<string[]> {
      const rows = await db.category.findMany({
        where: { countryCode, slug: { in: [...slugs] }, isActive: true },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    },

    async listCategorySlugs(countryCode: string): Promise<string[]> {
      const rows = await db.category.findMany({
        where: { countryCode, isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true },
      });
      return rows.map((row) => row.slug);
    },

    async listLanguages(): Promise<{ code: string; nativeName: string }[]> {
      return db.language.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { code: true, nativeName: true },
      });
    },
  };
}
