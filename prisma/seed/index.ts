import 'dotenv/config';
import { createDatabaseClient } from '@/adapters/db/client';
import { getServerEnv } from '@/config/env';
import { seedReferenceData } from './reference-data';

/** Loads reference data and clearly fake demo data. Never run against production. */
async function main(): Promise<void> {
  const env = getServerEnv();
  if (env.APP_ENV === 'production') {
    throw new Error('Refusing to seed a production database.');
  }
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    await seedReferenceData(db);
    console.log('Seeded reference data: countries, languages, categories, plans, settings.');
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
