import type { DbClient } from './db-client';

export type OneTimeTokenPurpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD' | 'CHANGE_EMAIL';

export interface OneTimeTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly expiresAt: Date;
}

export type OneTimeTokenRepository = ReturnType<typeof createOneTimeTokenRepository>;

/** Single-use emailed links, stored as hashes. */
export function createOneTimeTokenRepository(db: DbClient) {
  return {
    async create(data: {
      purpose: OneTimeTokenPurpose;
      tokenHash: string;
      userId: string;
      email: string;
      expiresAt: Date;
    }): Promise<void> {
      await db.oneTimeToken.create({ data });
    },

    /** An unused, unexpired token for this purpose. */
    findUsable: (
      tokenHash: string,
      purpose: OneTimeTokenPurpose,
      now: Date,
    ): Promise<OneTimeTokenRecord | null> =>
      db.oneTimeToken.findFirst({
        where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: now } },
        select: { id: true, userId: true, email: true, expiresAt: true },
      }),

    /** Marks a token used. False if it was already used, so a link works only once. */
    async consume(id: string, usedAt: Date): Promise<boolean> {
      const result = await db.oneTimeToken.updateMany({
        where: { id, usedAt: null },
        data: { usedAt },
      });
      return result.count === 1;
    },

    /** Voids a user's outstanding links of one kind, e.g. older reset links after a new one. */
    async invalidateOutstanding(
      userId: string,
      purpose: OneTimeTokenPurpose,
      now: Date,
    ): Promise<void> {
      await db.oneTimeToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: now },
      });
    },

    async deleteExpired(now: Date): Promise<number> {
      const result = await db.oneTimeToken.deleteMany({ where: { expiresAt: { lte: now } } });
      return result.count;
    },
  };
}
