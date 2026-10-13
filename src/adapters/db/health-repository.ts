import type { DbClient } from './db-client';

export interface HealthRepository {
  /** True when a trivial query succeeds. */
  isDatabaseReachable(): Promise<boolean>;
}

/** Database health checks used by /api/health and uptime monitoring (NFR-10). */
export function createHealthRepository(db: DbClient): HealthRepository {
  return {
    async isDatabaseReachable() {
      try {
        await db.$queryRaw`SELECT 1`;
        return true;
      } catch {
        // Unreachable is the answer, not an error; the health endpoint reports it.
        return false;
      }
    },
  };
}
