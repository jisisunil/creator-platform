import type { DbClient } from './db-client';

export type ConsentKind = 'AGE_CONFIRMATION' | 'PRIVACY_NOTICE' | 'MARKETING';

export interface ConsentEntry {
  readonly kind: ConsentKind;
  readonly isGranted: boolean;
  readonly noticeVersion: string;
  readonly createdAt: Date;
}

export type ConsentRepository = ReturnType<typeof createConsentRepository>;

/** Append-only consent history (PR-3). There is deliberately no update or delete here. */
export function createConsentRepository(db: DbClient) {
  return {
    async append(
      userId: string,
      entries: readonly { kind: ConsentKind; isGranted: boolean; noticeVersion: string }[],
      ipAddress: string | null,
    ): Promise<void> {
      await db.consentRecord.createMany({
        data: entries.map((entry) => ({ ...entry, userId, ipAddress })),
      });
    },

    latest: (userId: string, kind: ConsentKind): Promise<ConsentEntry | null> =>
      db.consentRecord.findFirst({
        where: { userId, kind },
        orderBy: { createdAt: 'desc' },
        select: { kind: true, isGranted: true, noticeVersion: true, createdAt: true },
      }),

    /** The latest privacy notice version this user agreed to, if any. */
    async latestAcceptedNoticeVersion(userId: string): Promise<string | null> {
      const row = await db.consentRecord.findFirst({
        where: { userId, kind: 'PRIVACY_NOTICE', isGranted: true },
        orderBy: { createdAt: 'desc' },
        select: { noticeVersion: true },
      });
      return row?.noticeVersion ?? null;
    },

    history: (userId: string): Promise<ConsentEntry[]> =>
      db.consentRecord.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { kind: true, isGranted: true, noticeVersion: true, createdAt: true },
      }),
  };
}
