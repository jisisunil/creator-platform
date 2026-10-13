import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { signUpWithPassword, verifyEmail } from '@/services/accounts';
import { createTestDatabaseClient } from '../test-database';
import {
  createTestContext,
  latestEmailLink,
  requestFrom,
  resetDatabase,
  STRONG_PASSWORD,
  type TestContext,
  tokenFromLink,
  VALID_CAPTCHA,
} from '../test-context';

const db = createTestDatabaseClient();
let ctx: TestContext;

const creatorInput = {
  role: 'CREATOR' as const,
  name: 'Asha Creator',
  email: 'Asha@Example.in',
  password: STRONG_PASSWORD,
  acceptsMarketing: true,
  captchaToken: null,
};

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

describe('sign-up (UC-A1, PRV-1)', () => {
  it('UC-A1 creates an unverified account with consent records and a verification email', async () => {
    await signUpWithPassword(ctx, creatorInput, requestFrom());

    const user = await db.user.findUniqueOrThrow({ where: { email: 'asha@example.in' } });
    expect(user).toMatchObject({ role: 'CREATOR', status: 'PENDING_VERIFICATION' });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);

    const consents = await db.consentRecord.findMany({ where: { userId: user.id } });
    expect(consents.map((consent) => [consent.kind, consent.isGranted]).sort()).toEqual([
      ['AGE_CONFIRMATION', true],
      ['MARKETING', true],
      ['PRIVACY_NOTICE', true],
    ]);
    expect(await latestEmailLink(db, 'verifyEmail', 'asha@example.in')).toMatch(
      /^https:\/\/app\.test\/en\/verify-email\?token=/,
    );
    expect(ctx.enqueuedJobs).toContain('email.dispatch');
  });

  it('UC-A1 does not reveal an already registered email: same result, owner is emailed', async () => {
    await signUpWithPassword(ctx, creatorInput, requestFrom());

    await expect(
      signUpWithPassword(
        ctx,
        { ...creatorInput, name: 'Someone else' },
        requestFrom('198.51.100.7'),
      ),
    ).resolves.toBeUndefined();

    expect(await db.user.count()).toBe(1);
    expect(
      await db.emailOutbox.count({
        where: { template: 'accountAlreadyExists', toAddress: 'asha@example.in' },
      }),
    ).toBe(1);
  });

  it('UC-A1 rejects disposable email domains', async () => {
    await expect(
      signUpWithPassword(ctx, { ...creatorInput, email: 'x@mailinator.com' }, requestFrom()),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      fieldErrors: { email: 'email.disposable' },
    });
    expect(await db.user.count()).toBe(0);
  });

  it('SR-1 rejects breached passwords', async () => {
    await expect(
      signUpWithPassword(ctx, { ...creatorInput, password: 'password123456' }, requestFrom()),
    ).rejects.toMatchObject({ fieldErrors: { password: 'password.breached' } });
  });

  it('UC-A1 brand sign-up creates the brand on the free beta plan with the owner', async () => {
    await signUpWithPassword(
      ctx,
      {
        ...creatorInput,
        role: 'BRAND',
        email: 'owner@spiceco.in',
        brandName: 'Spice Co',
        industry: 'food-beverage',
      },
      requestFrom(),
    );

    const brand = await db.brand.findFirstOrThrow({ include: { plan: true, members: true } });
    expect(brand).toMatchObject({ name: 'Spice Co', emailDomain: 'spiceco.in', trialEndsAt: null });
    expect(brand.plan.code).toBe('FREE_BETA');
    expect(brand.members).toEqual([expect.objectContaining({ role: 'OWNER' })]);
  });

  it('UC-B1 starts a 14-day trial when the free beta has ended', async () => {
    await db.platformSetting.update({ where: { key: 'isFreeBetaActive' }, data: { value: false } });

    await signUpWithPassword(
      ctx,
      { ...creatorInput, role: 'BRAND', brandName: 'Spice Co', industry: 'food-beverage' },
      requestFrom(),
    );

    const brand = await db.brand.findFirstOrThrow({ include: { plan: true } });
    expect(brand.plan.code).toBe('TRIAL');
    expect(brand.trialEndsAt).toEqual(new Date('2026-10-23T10:00:00Z'));
  });

  it('SR-11 requires a solved CAPTCHA when CAPTCHA is enabled', async () => {
    ctx.setCaptchaEnabled(true);

    await expect(signUpWithPassword(ctx, creatorInput, requestFrom())).rejects.toMatchObject({
      code: 'CAPTCHA_REQUIRED',
    });
    await expect(
      signUpWithPassword(ctx, { ...creatorInput, captchaToken: VALID_CAPTCHA }, requestFrom()),
    ).resolves.toBeUndefined();
  });

  it('SR-11 limits sign-ups per IP', async () => {
    for (let index = 0; index < 5; index += 1) {
      await signUpWithPassword(
        ctx,
        { ...creatorInput, email: `user${index}@example.in` },
        requestFrom('192.0.2.1'),
      );
    }

    await expect(
      signUpWithPassword(
        ctx,
        { ...creatorInput, email: 'sixth@example.in' },
        requestFrom('192.0.2.1'),
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});

describe('email verification (FR-1.1)', () => {
  it('FR-1.1 activates the account once, and the link cannot be reused', async () => {
    await signUpWithPassword(ctx, creatorInput, requestFrom());
    const token = tokenFromLink(await latestEmailLink(db, 'verifyEmail', 'asha@example.in'));

    await verifyEmail(ctx, token, requestFrom());

    const user = await db.user.findUniqueOrThrow({ where: { email: 'asha@example.in' } });
    expect(user.status).toBe('ACTIVE');
    expect(user.emailVerifiedAt).toEqual(ctx.clock.now());
    await expect(verifyEmail(ctx, token, requestFrom())).rejects.toMatchObject({
      code: 'INVALID_LINK',
    });
  });

  it('FR-1.1 rejects expired verification links', async () => {
    await signUpWithPassword(ctx, creatorInput, requestFrom());
    const token = tokenFromLink(await latestEmailLink(db, 'verifyEmail', 'asha@example.in'));

    ctx.clock.advance(49 * 60 * 60 * 1000);

    await expect(verifyEmail(ctx, token, requestFrom())).rejects.toMatchObject({
      code: 'INVALID_LINK',
    });
  });
});
