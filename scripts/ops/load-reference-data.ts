/**
 * Loads reference data (countries, languages, categories, plans, privacy notices, default
 * settings) from src/config. Safe in every environment, including production: it only
 * upserts, and never overwrites settings an admin changed. deploy.sh runs it after the
 * migrations on every deploy, so configuration changes ship with the code.
 */
import { createDatabaseClient } from '@/adapters/db/client';
import { seedReferenceData } from '../../prisma/seed/reference-data';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');
  const db = createDatabaseClient(databaseUrl);
  try {
    await seedReferenceData(db);
    console.log('Reference data is up to date.');
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
