import type { Prisma } from '@/generated/prisma/client';
import type { DbClient } from './db-client';

export interface SavedSearchRecord {
  readonly id: string;
  readonly name: string;
  readonly filters: unknown;
  readonly filtersVersion: number;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export type DiscoveryRepository = ReturnType<typeof createDiscoveryRepository>;

/** Saved searches (FR-5.4) and profile views (SEC-3, UC-C7). Scoped to the brand. */
export function createDiscoveryRepository(db: DbClient) {
  return {
    async saveSearch(data: {
      brandId: string;
      createdByUserId: string;
      name: string;
      filters: object;
      filtersVersion: number;
    }): Promise<string> {
      const created = await db.savedSearch.create({
        data: { ...data, filters: data.filters as Prisma.InputJsonValue },
        select: { id: true },
      });
      return created.id;
    },

    countSavedSearches: (brandId: string): Promise<number> =>
      db.savedSearch.count({ where: { brandId } }),

    listSavedSearches: (brandId: string): Promise<SavedSearchRecord[]> =>
      db.savedSearch.findMany({
        where: { brandId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          filters: true,
          filtersVersion: true,
          createdByUserId: true,
          createdAt: true,
        },
      }),

    findSavedSearch: (id: string, brandId: string): Promise<SavedSearchRecord | null> =>
      db.savedSearch.findFirst({
        where: { id, brandId },
        select: {
          id: true,
          name: true,
          filters: true,
          filtersVersion: true,
          createdByUserId: true,
          createdAt: true,
        },
      }),

    async deleteSavedSearch(id: string, brandId: string): Promise<boolean> {
      const result = await db.savedSearch.deleteMany({ where: { id, brandId } });
      return result.count === 1;
    },

    async recordProfileView(
      creatorId: string,
      viewerBrandId: string,
      viewedAt: Date,
    ): Promise<void> {
      await db.profileView.create({ data: { creatorId, viewerBrandId, viewedAt } });
    },

    countViewsByBrandSince: (viewerBrandId: string, since: Date): Promise<number> =>
      db.profileView.count({ where: { viewerBrandId, viewedAt: { gte: since } } }),

    countViewsOfCreatorSince: (creatorId: string, since: Date): Promise<number> =>
      db.profileView.count({ where: { creatorId, viewedAt: { gte: since } } }),
  };
}
