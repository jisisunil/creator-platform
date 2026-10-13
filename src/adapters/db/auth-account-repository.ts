import type { DbClient } from './db-client';

export type AuthAccountRepository = ReturnType<typeof createAuthAccountRepository>;

/** Links between users and external sign-in providers (Google). */
export function createAuthAccountRepository(db: DbClient) {
  return {
    async findUserId(provider: string, providerAccountId: string): Promise<string | null> {
      const row = await db.authAccount.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        select: { userId: true },
      });
      return row?.userId ?? null;
    },

    async link(userId: string, provider: string, providerAccountId: string): Promise<void> {
      await db.authAccount.create({ data: { userId, provider, providerAccountId } });
    },
  };
}
