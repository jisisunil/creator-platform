import type { DbClient } from './db-client';

export type ReportTarget = 'BRAND' | 'CREATOR' | 'RATING' | 'PAYMENT';

export type ReportRepository = ReturnType<typeof createReportRepository>;

/** Reports for the admin moderation queue (FR-8.3, FR-10.3, UC-R5). */
export function createReportRepository(db: DbClient) {
  return {
    async create(data: {
      reporterUserId: string;
      targetType: ReportTarget;
      targetId: string;
      threadId: string | null;
      reason: string;
    }): Promise<string> {
      const created = await db.report.create({ data, select: { id: true } });
      return created.id;
    },

    /** True when this user already has an open report about the target (no duplicates). */
    async hasOpenReport(reporterUserId: string, targetType: ReportTarget, targetId: string) {
      const count = await db.report.count({
        where: { reporterUserId, targetType, targetId, status: 'OPEN' },
      });
      return count > 0;
    },
  };
}
