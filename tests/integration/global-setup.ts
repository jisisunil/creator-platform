import { execSync } from 'node:child_process';
import { getTestDatabaseUrl } from './test-database-url';

/** Brings the test database schema up to date once before integration tests run. */
export default function setup(): void {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: getTestDatabaseUrl() },
    stdio: 'pipe',
  });
}
