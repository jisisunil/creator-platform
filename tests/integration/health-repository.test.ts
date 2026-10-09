import { afterAll, describe, expect, it } from 'vitest';
import { createDatabaseClient } from '@/adapters/db/client';
import { createHealthRepository } from '@/adapters/db/health-repository';
import { createTestDatabaseClient } from './test-database';

describe('health repository (NFR-10)', () => {
  const db = createTestDatabaseClient();
  afterAll(() => db.$disconnect());

  it('reports a reachable database', async () => {
    await expect(createHealthRepository(db).isDatabaseReachable()).resolves.toBe(true);
  });

  it('reports an unreachable database instead of throwing', async () => {
    const unreachable = createDatabaseClient('postgresql://nobody:nothing@127.0.0.1:1/none');

    await expect(createHealthRepository(unreachable).isDatabaseReachable()).resolves.toBe(false);
    await unreachable.$disconnect();
  });
});
