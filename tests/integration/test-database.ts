import { createDatabaseClient, type DatabaseClient } from '@/adapters/db/client';
import { getTestDatabaseUrl } from './test-database-url';

/** A Prisma client for the test database. Disconnect it in afterAll. */
export function createTestDatabaseClient(): DatabaseClient {
  return createDatabaseClient(getTestDatabaseUrl());
}
