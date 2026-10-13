import type { DbClient } from './db-client';

export type RateLimitRepository = ReturnType<typeof createRateLimitRepository>;

/** Fixed-window counters (ADR-004). Keys are hashed by the caller. */
export function createRateLimitRepository(db: DbClient) {
  return {
    /** Adds one to the window's counter atomically and returns the new count. */
    async increment(key: string, windowStart: Date): Promise<number> {
      const rows = await db.$queryRaw<{ count: number }[]>`
        INSERT INTO "RateLimitCounter" ("id", "key", "windowStart", "count", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${key}, ${windowStart}, 1, now(), now())
        ON CONFLICT ("key", "windowStart")
        DO UPDATE SET "count" = "RateLimitCounter"."count" + 1, "updatedAt" = now()
        RETURNING "count"`;
      return rows[0]?.count ?? 1;
    },

    /** The current count without changing it. */
    async current(key: string, windowStart: Date): Promise<number> {
      const row = await db.rateLimitCounter.findUnique({
        where: { key_windowStart: { key, windowStart } },
        select: { count: true },
      });
      return row?.count ?? 0;
    },

    async reset(key: string, windowStart: Date): Promise<void> {
      await db.rateLimitCounter.deleteMany({ where: { key, windowStart } });
    },

    async deleteWindowsBefore(cutoff: Date): Promise<number> {
      const result = await db.rateLimitCounter.deleteMany({
        where: { windowStart: { lt: cutoff } },
      });
      return result.count;
    },
  };
}
