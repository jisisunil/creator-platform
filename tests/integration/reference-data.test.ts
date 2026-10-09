import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLAN_DEFINITIONS } from '@/config/plans';
import { seedReferenceData } from '../../prisma/seed/reference-data';
import { createTestDatabaseClient } from './test-database';

describe('reference data and first migration', () => {
  const db = createTestDatabaseClient();

  beforeAll(async () => {
    await seedReferenceData(db);
  });
  afterAll(() => db.$disconnect());

  it('enables the pgvector extension for future embeddings', async () => {
    const rows = await db.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'`;

    expect(rows).toHaveLength(1);
  });

  it('seeds India as the only enabled country', async () => {
    const enabled = await db.countrySettings.findMany({ where: { isEnabled: true } });

    expect(enabled.map((country) => country.code)).toEqual(['IN']);
    expect(enabled[0]).toMatchObject({ currencyCode: 'INR', numberFormat: 'INDIAN' });
  });

  it('is idempotent and keeps admin-changed settings', async () => {
    await db.platformSetting.update({ where: { key: 'isFreeBetaActive' }, data: { value: false } });

    await seedReferenceData(db);

    expect(await db.plan.count()).toBe(PLAN_DEFINITIONS.length);
    const setting = await db.platformSetting.findUnique({ where: { key: 'isFreeBetaActive' } });
    expect(setting?.value).toBe(false);

    await db.platformSetting.update({ where: { key: 'isFreeBetaActive' }, data: { value: true } });
  });
});
