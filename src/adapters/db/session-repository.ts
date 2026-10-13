import type { DbClient } from './db-client';
import type { UserRecord } from './user-repository';

export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly lastSeenAt: Date;
  readonly twoFactorVerifiedAt: Date | null;
}

export interface NewSession {
  readonly tokenHash: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly lastSeenAt: Date;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly deviceHash: string;
}

const SESSION_SELECT = {
  id: true,
  userId: true,
  expiresAt: true,
  lastSeenAt: true,
  twoFactorVerifiedAt: true,
} as const;

export type SessionRepository = ReturnType<typeof createSessionRepository>;

/** Server-side sessions, looked up by token hash (SR-2). */
export function createSessionRepository(db: DbClient) {
  return {
    create: (data: NewSession): Promise<SessionRecord> =>
      db.session.create({ data, select: SESSION_SELECT }),

    /** The unexpired session for a token hash, with its user. */
    async findActiveWithUser(
      tokenHash: string,
      now: Date,
    ): Promise<{ session: SessionRecord; user: UserRecord } | null> {
      const row = await db.session.findFirst({
        where: { tokenHash, expiresAt: { gt: now } },
        select: {
          ...SESSION_SELECT,
          user: {
            select: {
              id: true,
              email: true,
              emailVerifiedAt: true,
              passwordHash: true,
              name: true,
              role: true,
              status: true,
              countryCode: true,
              locale: true,
              failedLoginCount: true,
              lockedUntil: true,
              totpSecretEncrypted: true,
              totpEnabledAt: true,
            },
          },
        },
      });
      if (!row) return null;
      const { user, ...session } = row;
      return { session, user };
    },

    async extend(id: string, expiresAt: Date, lastSeenAt: Date): Promise<void> {
      await db.session.update({ where: { id }, data: { expiresAt, lastSeenAt } });
    },

    async markTwoFactorVerified(id: string, verifiedAt: Date): Promise<void> {
      await db.session.update({ where: { id }, data: { twoFactorVerifiedAt: verifiedAt } });
    },

    async deleteByTokenHash(tokenHash: string): Promise<void> {
      await db.session.deleteMany({ where: { tokenHash } });
    },

    /** Signs a user out everywhere, optionally keeping one session (e.g. the current one). */
    async deleteAllForUser(userId: string, exceptSessionId?: string): Promise<number> {
      const result = await db.session.deleteMany({
        where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      });
      return result.count;
    },

    async deleteExpired(now: Date): Promise<number> {
      const result = await db.session.deleteMany({ where: { expiresAt: { lte: now } } });
      return result.count;
    },
  };
}
