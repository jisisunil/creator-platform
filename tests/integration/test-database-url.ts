import 'dotenv/config';

/** The integration-test database URL. Refuses to run against anything that isn't a test DB. */
export function getTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set; see .env.example.');
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error('DATABASE_URL_TEST must point at a database whose name ends in "_test".');
  }
  return url;
}
