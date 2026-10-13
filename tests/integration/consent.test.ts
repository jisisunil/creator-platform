import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acceptCurrentPrivacyNotice,
  getConsentHistory,
  getConsentStatus,
  setMarketingConsent,
} from '@/services/consent';
import { createVerifiedUser } from './accounts/fixtures';
import { createTestDatabaseClient } from './test-database';
import { createTestContext, requestFrom, resetDatabase, type TestContext } from './test-context';

const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

async function publishNotice(version: string, isMaterialChange: boolean) {
  await db.privacyNotice.create({
    data: { countryCode: 'IN', version, publishedAt: new Date('2027-01-01'), isMaterialChange },
  });
  await db.countrySettings.update({
    where: { code: 'IN' },
    data: { privacyNoticeVersion: version },
  });
}

describe('consent (PR-2..PR-4, PRV-5, PRV-8)', () => {
  it('PRV-1 a new account has agreed to the current notice', async () => {
    const user = await createVerifiedUser(ctx, db, { email: 'a@example.in' });

    await expect(getConsentStatus(ctx, user)).resolves.toMatchObject({
      needsReconsent: false,
      hasMarketingConsent: false,
    });
  });

  it('PRV-8 asks again after a material change, and accepting clears it', async () => {
    const user = await createVerifiedUser(ctx, db, { email: 'a@example.in' });
    await publishNotice('2027-01-v2', true);

    expect((await getConsentStatus(ctx, user)).needsReconsent).toBe(true);
    await acceptCurrentPrivacyNotice(ctx, user, requestFrom());
    expect((await getConsentStatus(ctx, user)).needsReconsent).toBe(false);
  });

  it('PRV-8 does not ask again for a non-material update', async () => {
    const user = await createVerifiedUser(ctx, db, { email: 'a@example.in' });
    await publishNotice('2027-01-v2', false);

    expect((await getConsentStatus(ctx, user)).needsReconsent).toBe(false);
  });

  it('PR-4 / PRV-5 marketing consent is withdrawn as easily as given, keeping history', async () => {
    const user = await createVerifiedUser(ctx, db, { email: 'a@example.in' });

    await setMarketingConsent(ctx, user, true, requestFrom());
    expect((await getConsentStatus(ctx, user)).hasMarketingConsent).toBe(true);
    ctx.clock.advance(1000);
    await setMarketingConsent(ctx, user, false, requestFrom());
    expect((await getConsentStatus(ctx, user)).hasMarketingConsent).toBe(false);

    const history = await getConsentHistory(ctx, user.id);
    expect(history.filter((entry) => entry.kind === 'MARKETING')).toHaveLength(3);
  });
});
