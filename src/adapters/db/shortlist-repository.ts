import type { DbClient } from './db-client';

export interface ShortlistSummary {
  readonly id: string;
  readonly name: string;
  readonly isSharedWithTeam: boolean;
  readonly createdByUserId: string;
  readonly createdByName: string;
  readonly itemCount: number;
  readonly updatedAt: Date;
}

export interface ShortlistEntry {
  readonly itemId: string;
  readonly creatorId: string;
  readonly note: string;
  readonly addedAt: Date;
  /** False when the creator was suspended or left search (UC-D3). */
  readonly isCreatorAvailable: boolean;
}

export interface ShortlistAccess {
  readonly id: string;
  readonly brandId: string;
  readonly createdByUserId: string;
  readonly isSharedWithTeam: boolean;
}

/** A user may use a shortlist if it is in their brand and either theirs or shared (FR-6.1). */
function visibleTo(brandId: string, userId: string) {
  return { brandId, OR: [{ createdByUserId: userId }, { isSharedWithTeam: true }] };
}

export type ShortlistRepository = ReturnType<typeof createShortlistRepository>;

/** Brand shortlists and their creators (FR-6, UC-D3). Every query is scoped to the brand. */
export function createShortlistRepository(db: DbClient) {
  return {
    async create(data: {
      brandId: string;
      createdByUserId: string;
      name: string;
    }): Promise<string> {
      const created = await db.shortlist.create({ data, select: { id: true } });
      return created.id;
    },

    countForBrand: (brandId: string): Promise<number> => db.shortlist.count({ where: { brandId } }),

    async listVisible(brandId: string, userId: string): Promise<ShortlistSummary[]> {
      const rows = await db.shortlist.findMany({
        where: visibleTo(brandId, userId),
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          isSharedWithTeam: true,
          createdByUserId: true,
          updatedAt: true,
          createdBy: { select: { name: true } },
          _count: { select: { items: true } },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        isSharedWithTeam: row.isSharedWithTeam,
        createdByUserId: row.createdByUserId,
        createdByName: row.createdBy.name,
        itemCount: row._count.items,
        updatedAt: row.updatedAt,
      }));
    },

    /** The shortlist if this user may see it; otherwise null ("not found", SEC-2). */
    findVisible: (id: string, brandId: string, userId: string): Promise<ShortlistAccess | null> =>
      db.shortlist.findFirst({
        where: { id, ...visibleTo(brandId, userId) },
        select: { id: true, brandId: true, createdByUserId: true, isSharedWithTeam: true },
      }),

    async getName(id: string): Promise<string> {
      const row = await db.shortlist.findUniqueOrThrow({ where: { id }, select: { name: true } });
      return row.name;
    },

    async entries(shortlistId: string): Promise<ShortlistEntry[]> {
      const rows = await db.shortlistItem.findMany({
        where: { shortlistId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          creatorId: true,
          note: true,
          createdAt: true,
          creator: { select: { isSearchable: true, user: { select: { status: true } } } },
        },
      });
      return rows.map((row) => ({
        itemId: row.id,
        creatorId: row.creatorId,
        note: row.note,
        addedAt: row.createdAt,
        isCreatorAvailable: row.creator.isSearchable && row.creator.user.status === 'ACTIVE',
      }));
    },

    async rename(id: string, name: string): Promise<void> {
      await db.shortlist.update({ where: { id }, data: { name } });
    },

    async setShared(id: string, isSharedWithTeam: boolean): Promise<void> {
      await db.shortlist.update({ where: { id }, data: { isSharedWithTeam } });
    },

    async delete(id: string): Promise<void> {
      await db.shortlist.delete({ where: { id } });
    },

    /** UC-D3: adding a creator twice is ignored. Returns whether a row was added. */
    async addCreator(shortlistId: string, creatorId: string): Promise<boolean> {
      const result = await db.shortlistItem.createMany({
        data: [{ shortlistId, creatorId }],
        skipDuplicates: true,
      });
      if (result.count > 0) await db.shortlist.update({ where: { id: shortlistId }, data: {} });
      return result.count > 0;
    },

    async removeItem(shortlistId: string, itemId: string): Promise<boolean> {
      const result = await db.shortlistItem.deleteMany({ where: { id: itemId, shortlistId } });
      return result.count === 1;
    },

    async setNote(shortlistId: string, itemId: string, note: string): Promise<boolean> {
      const result = await db.shortlistItem.updateMany({
        where: { id: itemId, shortlistId },
        data: { note },
      });
      return result.count === 1;
    },
  };
}
