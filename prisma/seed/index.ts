import 'dotenv/config';
import { createDatabaseClient } from '@/adapters/db/client';
import { getServerEnv } from '@/config/env';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemoAccounts } from './demo-accounts';
import { seedDemoCollaborations } from './demo-collaborations';
import { seedDemoCreators } from './demo-creators';
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
    console.log(
      'Seeded reference data: countries, notices, languages, categories, plans, settings.',
    );
    await seedDemoAccounts(db);
    console.log(`Demo accounts (password: ${DEMO_PASSWORD}):`);
    for (const [role, email] of Object.entries(DEMO_ACCOUNTS)) console.log(`  ${role}: ${email}`);
    const creators = await seedDemoCreators(db, env.TOKEN_ENCRYPTION_KEY);
    console.log(
      creators > 0
        ? `Seeded ${creators} demo creators (demo-creator-01..60@example.test, same password).`
        : 'Demo creators already present.',
    );
    const hasCollaborations = await seedDemoCollaborations(db, {
      tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
      fileStorageDir: env.FILE_STORAGE_DIR,
      appUrl: env.APP_URL,
    });
    console.log(
      hasCollaborations
        ? 'Seeded demo collaborations for the brand owner (with demo creators 03, 06 and 12).'
        : 'Demo collaborations already present.',
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
