import type { AuthenticityFlagType, DetectedFlag, ScoreBreakdown } from '@/domain/score';
import type { Prisma } from '@/generated/prisma/client';
import type { DbClient } from './db-client';

export interface StoredScore {
  readonly score: number;
  readonly components: ScoreBreakdown['components'];
  readonly weightsVersion: string;
  readonly computedAt: Date;
}

export type ScoreRepository = ReturnType<typeof createScoreRepository>;

/** Score history and authenticity flags (FR-4). */
export function createScoreRepository(db: DbClient) {
  return {
    async addResult(creatorId: string, breakdown: ScoreBreakdown, computedAt: Date): Promise<void> {
      await db.scoreResult.create({
        data: {
          creatorId,
          score: breakdown.score,
          components: breakdown.components as unknown as Prisma.InputJsonValue,
          weightsVersion: breakdown.weightsVersion,
          computedAt,
        },
      });
    },

    async latestForCreator(creatorId: string): Promise<StoredScore | null> {
      const row = await db.scoreResult.findFirst({
        where: { creatorId },
        orderBy: { computedAt: 'desc' },
        select: { score: true, components: true, weightsVersion: true, computedAt: true },
      });
      if (!row) return null;
      return { ...row, components: row.components as unknown as ScoreBreakdown['components'] };
    },

    /** UC-M2: flag types an admin cleared since `since` (false alarms to ignore for now). */
    async recentlyClearedFlagTypes(
      creatorId: string,
      since: Date,
    ): Promise<AuthenticityFlagType[]> {
      const rows = await db.authenticityFlag.findMany({
        where: { creatorId, status: 'CLEARED', reviewedAt: { gte: since } },
        distinct: ['type'],
        select: { type: true },
      });
      return rows.map((row) => row.type);
    },

    /**
     * FR-4.5 / UC-M2: opens a flag for each newly detected signal. A type that is already
     * open or under review isn't duplicated; one an admin cleared can be raised again.
     */
    async raiseFlags(creatorId: string, flags: readonly DetectedFlag[]): Promise<number> {
      let raised = 0;
      for (const flag of flags) {
        const existing = await db.authenticityFlag.count({
          where: { creatorId, type: flag.type, status: { in: ['OPEN', 'SUSPICIOUS'] } },
        });
        if (existing > 0) continue;
        await db.authenticityFlag.create({
          data: {
            creatorId,
            type: flag.type,
            details: { ...flag.details, accountId: flag.accountId } as Prisma.InputJsonValue,
          },
        });
        raised += 1;
      }
      return raised;
    },
  };
}
