import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  resolveSession,
  signInWithPassword,
  signOut,
  signOutEverywhere,
  signUpWithPassword,
} from '@/services/accounts';
import { createTestDatabaseClient } from '../test-database';
import {
  createTestContext,
  requestFrom,
  resetDatabase,
  STRONG_PASSWORD,
  type TestContext,
  VALID_CAPTCHA,
} from '../test-context';
import { createVerifiedUser } from './fixtures';

const db = createTestDatabaseClient();
let ctx: TestContext;
const email = 'ravi@example.in';
const MINUTE = 60_000;

const signIn = (password = STRONG_PASSWORD, captchaToken: string | null = null, ip?: string) =>
  signInWithPassword(ctx, { email, password, captchaToken }, requestFrom(ip));

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

describe('sign-in (UC-A2, SR-3)', () => {
  it('UC-A2 signs in with the right password and opens a hashed session', async () => {
    const user = await createVerifiedUser(ctx, db, { email });

    const result = await signIn();

    expect(result).toMatchObject({ userId: user.id, needsTwoFactor: false });
    const stored = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).not.toBe(result.session.token);
    expect(await db.auditEvent.count({ where: { action: 'login.success' } })).toBe(1);
  });

  it('SR-3 gives the same error for an unknown email and a wrong password', async () => {
    await createVerifiedUser(ctx, db, { email });

    const unknown = signInWithPassword(
      ctx,
      { email: 'nobody@example.in', password: STRONG_PASSWORD, captchaToken: null },
      requestFrom(),
    );
    await expect(unknown).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(signIn('wrong-password-1')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('UC-A2 locks the account for 15 minutes after 5 wrong passwords', async () => {
    await createVerifiedUser(ctx, db, { email });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(signIn('wrong-password-1')).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
    }

    // Even the right password is refused during the lockout, with the same message.
    await expect(signIn()).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(await db.auditEvent.count({ where: { action: 'account.locked' } })).toBe(1);

    ctx.clock.advance(16 * MINUTE);
    await expect(signIn()).resolves.toMatchObject({ needsTwoFactor: false });
  });

  it('SR-3 asks for a CAPTCHA after 3 failures when CAPTCHA is enabled', async () => {
    await createVerifiedUser(ctx, db, { email });
    ctx.setCaptchaEnabled(true);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(signIn('wrong-password-1')).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
    }

    await expect(signIn()).rejects.toMatchObject({ code: 'CAPTCHA_REQUIRED' });
    await expect(signIn(STRONG_PASSWORD, VALID_CAPTCHA)).resolves.toBeDefined();
  });

  it('SR-3 rate-limits sign-in attempts per account', async () => {
    await createVerifiedUser(ctx, db, { email });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      // Different IPs, same account: only the per-account limit applies.
      await signIn('wrong-password-1', null, `192.0.2.${attempt}`).catch(() => undefined);
    }

    await expect(signIn(STRONG_PASSWORD, null, '192.0.2.99')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('FR-1.1 refuses unverified accounts after a correct password', async () => {
    await signUpWithPassword(
      ctx,
      {
        role: 'CREATOR',
        name: 'Unverified',
        email,
        password: STRONG_PASSWORD,
        acceptsMarketing: false,
        captchaToken: null,
      },
      requestFrom(),
    );

    await expect(signIn()).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });

  it('UC-A2 refuses suspended accounts', async () => {
    const user = await createVerifiedUser(ctx, db, { email });
    await db.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });

    await expect(signIn()).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
  });

  it('SEC-9 emails the user about a sign-in from a new device, not the first one', async () => {
    await createVerifiedUser(ctx, db, { email });

    await signInWithPassword(
      ctx,
      { email, password: STRONG_PASSWORD, captchaToken: null },
      requestFrom('203.0.113.1', 'Phone/1'),
    );
    await signInWithPassword(
      ctx,
      { email, password: STRONG_PASSWORD, captchaToken: null },
      requestFrom('203.0.113.1', 'Phone/1'),
    );
    expect(await db.emailOutbox.count({ where: { template: 'newDeviceSignIn' } })).toBe(0);

    await signInWithPassword(
      ctx,
      { email, password: STRONG_PASSWORD, captchaToken: null },
      requestFrom('203.0.113.2', 'Laptop/2'),
    );
    expect(await db.emailOutbox.count({ where: { template: 'newDeviceSignIn' } })).toBe(1);
  });

  it('SR-13 logs failures without passwords or full emails', async () => {
    await createVerifiedUser(ctx, db, { email });
    await signIn('wrong-password-1').catch(() => undefined);
    await signInWithPassword(
      ctx,
      { email: 'nobody@example.in', password: 'secret-attempt', captchaToken: null },
      requestFrom(),
    ).catch(() => undefined);

    const events = JSON.stringify(await db.auditEvent.findMany());
    expect(events).not.toContain('wrong-password-1');
    expect(events).not.toContain('secret-attempt');
    expect(events).not.toContain('nobody@example.in');
    expect(events).toContain('n***@example.in');
  });
});

describe('sessions (SR-2)', () => {
  it('SR-2 resolves an active session and slides its expiry forward', async () => {
    await createVerifiedUser(ctx, db, { email });
    const { session } = await signIn();

    ctx.clock.advance(2 * 60 * MINUTE);
    const active = await resolveSession(ctx, session.token);

    expect(active?.user.email).toBe(email);
    const stored = await db.session.findFirstOrThrow();
    expect(stored.expiresAt).toEqual(new Date(ctx.clock.now().getTime() + 30 * 24 * 60 * MINUTE));
  });

  it('SR-2 rejects expired sessions', async () => {
    await createVerifiedUser(ctx, db, { email });
    const { session } = await signIn();

    ctx.clock.advance(31 * 24 * 60 * MINUTE);

    await expect(resolveSession(ctx, session.token)).resolves.toBeNull();
  });

  it('SR-2 ends sessions as soon as the account is suspended', async () => {
    const user = await createVerifiedUser(ctx, db, { email });
    const { session } = await signIn();

    await db.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });

    await expect(resolveSession(ctx, session.token)).resolves.toBeNull();
    expect(await db.session.count()).toBe(0);
  });

  it('SR-2 signs out one session, or every session at once', async () => {
    const user = await createVerifiedUser(ctx, db, { email });
    const first = await signIn();
    const second = await signIn();
    const third = await signIn();

    await signOut(ctx, first.session.token);
    await expect(resolveSession(ctx, first.session.token)).resolves.toBeNull();
    await expect(resolveSession(ctx, second.session.token)).resolves.not.toBeNull();

    await signOutEverywhere(ctx, user.id, requestFrom());
    await expect(resolveSession(ctx, second.session.token)).resolves.toBeNull();
    await expect(resolveSession(ctx, third.session.token)).resolves.toBeNull();
  });

  it('rejects unknown tokens', async () => {
    await expect(resolveSession(ctx, 'not-a-real-token')).resolves.toBeNull();
  });
});
