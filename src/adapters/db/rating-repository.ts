import { z } from 'zod';
import type { CollabSide } from '@/domain/chat';
import type { RatingScores } from '@/domain/ratings';
import type { DbClient } from './db-client';

export interface RatingRecord {
  readonly id: string;
  readonly dealId: string;
  readonly raterSide: CollabSide;
  readonly scores: RatingScores;
  readonly averageTenths: number;
  readonly comment: string | null;
  readonly visibleFrom: Date;
  readonly isHidden: boolean;
  readonly createdAt: Date;
}

export interface Reputation {
  /** Mean of the visible ratings' averages, in tenths; null with no ratings. */
  readonly averageTenths: number | null;
  readonly count: number;
  readonly recent: readonly {
    readonly comment: string;
    readonly averageTenths: number;
    readonly createdAt: Date;
  }[];
}

/** Scores JSON is validated when read back, like any external data. */
const storedScoresSchema = z.record(z.string(), z.number().int());

const RATING_SELECT = {
  id: true,
  dealId: true,
  raterSide: true,
  scores: true,
  averageTenths: true,
  comment: true,
  visibleFrom: true,
  isHidden: true,
  createdAt: true,
} as const;

function toRecord(row: {
  id: string;
  dealId: string;
  raterSide: CollabSide;
  scores: unknown;
  averageTenths: number;
  comment: string | null;
  visibleFrom: Date;
  isHidden: boolean;
  createdAt: Date;
}): RatingRecord {
  return { ...row, scores: storedScoresSchema.parse(row.scores) };
}

export type RatingRepository = ReturnType<typeof createRatingRepository>;

/** Ratings of completed deals and the reputations built from them (FR-10, UC-R7). */
export function createRatingRepository(db: DbClient) {
  return {
    async create(rating: {
      dealId: string;
      raterSide: CollabSide;
      raterUserId: string;
      scores: RatingScores;
      averageTenths: number;
      comment: string | null;
      visibleFrom: Date;
      createdAt: Date;
    }): Promise<string> {
      const created = await db.rating.create({
        data: { ...rating, scores: { ...rating.scores } },
        select: { id: true },
      });
      return created.id;
    },

    async listForDeal(dealId: string): Promise<RatingRecord[]> {
      const rows = await db.rating.findMany({ where: { dealId }, select: RATING_SELECT });
      return rows.map(toRecord);
    },

    async findById(id: string): Promise<RatingRecord | null> {
      const row = await db.rating.findUnique({ where: { id }, select: RATING_SELECT });
      return row ? toRecord(row) : null;
    },

    /** FR-10.2: once both sides have rated, both ratings show at once. */
    async revealDeal(dealId: string, at: Date): Promise<void> {
      await db.rating.updateMany({ where: { dealId }, data: { visibleFrom: at } });
    },

    /**
     * FR-10.2: a creator's or a brand's reputation from visible, unhidden ratings by the
     * other side: average, count and the latest comments.
     */
    async reputation(
      rated: { creatorId: string } | { brandId: string },
      now: Date,
      recentLimit: number,
    ): Promise<Reputation> {
      const where = {
        raterSide: 'creatorId' in rated ? ('BRAND' as const) : ('CREATOR' as const),
        isHidden: false,
        visibleFrom: { lte: now },
        deal: rated,
      };
      const [aggregate, recent] = await Promise.all([
        db.rating.aggregate({ where, _avg: { averageTenths: true }, _count: { _all: true } }),
        db.rating.findMany({
          where: { ...where, comment: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: recentLimit,
          select: { comment: true, averageTenths: true, createdAt: true },
        }),
      ]);
      const average = aggregate._avg.averageTenths;
      return {
        averageTenths: average === null ? null : Math.round(average),
        count: aggregate._count._all,
        recent: recent.map((row) => ({ ...row, comment: row.comment ?? '' })),
      };
    },
  };
}
