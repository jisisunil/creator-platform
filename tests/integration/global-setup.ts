import { execSync } from 'node:child_process';
import { seedReferenceData } from '../../prisma/seed/reference-data';
import { createTestDatabaseClient } from './test-database';
import { getTestDatabaseUrl } from './test-database-url';

/**
 * Brings the test database schema up to date and loads all reference data once before
 * integration tests run. Each test then resets only what tests change.
 */
export default async function setup(): Promise<void> {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: getTestDatabaseUrl() },
    stdio: 'pipe',
  });
  const db = createTestDatabaseClient();
  try {
    await seedReferenceData(db);
  } finally {
    await db.$disconnect();
  }
}
