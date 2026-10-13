import { TOTP } from 'otpauth';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  linkGoogleAfterPasswordCheck,
  resolveGoogleSignIn,
  resolveSession,
  signInWithPassword,
  startTotpEnrolment,
  verifyTwoFactorCode,
} from '@/services/accounts';
import { createTestDatabaseClient } from '../test-database';
import {
  createTestContext,
  requestFrom,
  resetDatabase,
  STRONG_PASSWORD,
  type TestContext,
} from '../test-context';
import { createVerifiedUser } from './fixtures';

const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

async function createAdmin(email: string) {
  const user = await createVerifiedUser(ctx, db, { email });
  await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  return user;
}

function codeFor(secret: string): string {
  return new TOTP({ secret, digits: 6, period: 30 }).generate({
    timestamp: ctx.clock.now().getTime(),
  });
}

describe('admin two-factor (SR-4)', () => {
  it('SR-4 admins need a TOTP check in each session before they are fully signed in', async () => {
    const admin = await createAdmin('admin@example.in');
    const result = await signInWithPassword(
      ctx,
      { email: 'admin@example.in', password: STRONG_PASSWORD, captchaToken: null },
      requestFrom(),
    );
    expect(result.needsTwoFactor).toBe(true);
    const session = await resolveSession(ctx, result.session.token);
    expect(session?.isTwoFactorSatisfied).toBe(false);

    const enrolment = await startTotpEnrolment(ctx, admin.id);
    await verifyTwoFactorCode(
      ctx,
      { userId: admin.id, sessionId: session?.sessionId ?? '', code: codeFor(enrolment.secret) },
      requestFrom(),
    );

    expect((await resolveSession(ctx, result.session.token))?.isTwoFactorSatisfied).toBe(true);
    const stored = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(stored.totpEnabledAt).not.toBeNull();
    expect(stored.totpSecretEncrypted).not.toContain(enrolment.secret);
  });

  it('SR-4 rejects wrong codes and keeps the same secret on reload', async () => {
    const admin = await createAdmin('admin@example.in');
    const result = await signInWithPassword(
      ctx,
      { email: 'admin@example.in', password: STRONG_PASSWORD, captchaToken: null },
      requestFrom(),
    );
    const session = await resolveSession(ctx, result.session.token);
    const first = await startTotpEnrolment(ctx, admin.id);

    await expect(
      verifyTwoFactorCode(
        ctx,
        { userId: admin.id, sessionId: session?.sessionId ?? '', code: '000000' },
        requestFrom(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { code: 'twoFactor.invalidCode' } });
    expect((await startTotpEnrolment(ctx, admin.id)).secret).toBe(first.secret);
  });

  it('non-admins are fully signed in without two-factor', async () => {
    await createVerifiedUser(ctx, db, { email: 'creator@example.in' });
    const result = await signInWithPassword(
      ctx,
      { email: 'creator@example.in', password: STRONG_PASSWORD, captchaToken: null },
      requestFrom(),
    );

    expect((await resolveSession(ctx, result.session.token))?.isTwoFactorSatisfied).toBe(true);
  });
});

describe('Google sign-in (UC-A1, UC-A2)', () => {
  const profile = {
    providerAccountId: 'google-123',
    email: 'Kiran@Example.in',
    isEmailVerified: true,
    name: 'Kiran',
  };

  it('UC-A1 creates a verified account when the user came from sign-up', async () => {
    const outcome = await resolveGoogleSignIn(
      ctx,
      profile,
      {
        role: 'BRAND',
        acceptsMarketing: false,
        brandName: 'Kiran Foods',
        industry: 'food-beverage',
      },
      requestFrom(),
    );

    expect(outcome.kind).toBe('signed-in');
    const user = await db.user.findUniqueOrThrow({ where: { email: 'kiran@example.in' } });
    expect(user).toMatchObject({ role: 'BRAND', status: 'ACTIVE', passwordHash: null });
    expect(await db.consentRecord.count({ where: { userId: user.id } })).toBe(3);
    expect(await db.brand.count()).toBe(1);
  });

  it('UC-A1 sends people who skipped sign-up back to it, creating nothing', async () => {
    const outcome = await resolveGoogleSignIn(ctx, profile, null, requestFrom());

    expect(outcome).toEqual({ kind: 'needs-sign-up' });
    expect(await db.user.count()).toBe(0);
  });

  it('signs in a returning Google user', async () => {
    await resolveGoogleSignIn(
      ctx,
      profile,
      { role: 'CREATOR', acceptsMarketing: false },
      requestFrom(),
    );

    const outcome = await resolveGoogleSignIn(ctx, profile, null, requestFrom());

    expect(outcome.kind).toBe('signed-in');
  });

  it('rejects Google accounts whose email Google has not verified', async () => {
    const outcome = await resolveGoogleSignIn(
      ctx,
      { ...profile, isEmailVerified: false },
      { role: 'CREATOR', acceptsMarketing: false },
      requestFrom(),
    );

    expect(outcome).toEqual({ kind: 'rejected', reason: 'email-not-verified' });
  });

  it('UC-A2 links Google to an existing password account only after the password check', async () => {
    const user = await createVerifiedUser(ctx, db, { email: 'kiran@example.in' });

    const outcome = await resolveGoogleSignIn(ctx, profile, null, requestFrom());
    expect(outcome).toEqual({ kind: 'needs-link', email: 'kiran@example.in' });
    expect(await db.authAccount.count()).toBe(0);

    await expect(
      linkGoogleAfterPasswordCheck(
        ctx,
        {
          providerAccountId: 'google-123',
          email: 'kiran@example.in',
          password: 'wrong-guess-123',
          captchaToken: null,
        },
        requestFrom(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(await db.authAccount.count()).toBe(0);

    await linkGoogleAfterPasswordCheck(
      ctx,
      {
        providerAccountId: 'google-123',
        email: 'kiran@example.in',
        password: STRONG_PASSWORD,
        captchaToken: null,
      },
      requestFrom(),
    );
    expect(await db.authAccount.findFirstOrThrow()).toMatchObject({ userId: user.id });
    expect((await resolveGoogleSignIn(ctx, profile, null, requestFrom())).kind).toBe('signed-in');
  });
});
