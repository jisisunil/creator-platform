import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  changePassword,
  confirmEmailChange,
  requestEmailChange,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  resolveSession,
  signInWithPassword,
  signUpWithPassword,
} from '@/services/accounts';
import { createTestDatabaseClient } from '../test-database';
import {
  createTestContext,
  latestEmailLink,
  requestFrom,
  resetDatabase,
  STRONG_PASSWORD,
  type TestContext,
  tokenFromLink,
} from '../test-context';
import { createVerifiedUser } from './fixtures';

const db = createTestDatabaseClient();
let ctx: TestContext;
const email = 'meera@example.in';
const NEW_PASSWORD = 'a-brand-new-passphrase';

const signIn = (password = STRONG_PASSWORD) =>
  signInWithPassword(ctx, { email, password, captchaToken: null }, requestFrom());

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

describe('password reset (UC-A3)', () => {
  it('UC-A3 gives no sign that an email is unknown and sends nothing', async () => {
    await expect(
      requestPasswordReset(ctx, 'nobody@example.in', requestFrom()),
    ).resolves.toBeUndefined();
    expect(await db.emailOutbox.count()).toBe(0);
  });

  it('UC-A3 resets the password once and signs out every session', async () => {
    await createVerifiedUser(ctx, db, { email });
    const { session } = await signIn();
    await requestPasswordReset(ctx, email, requestFrom());
    const token = tokenFromLink(await latestEmailLink(db, 'passwordReset', email));

    await resetPassword(ctx, token, NEW_PASSWORD, requestFrom());

    await expect(resolveSession(ctx, session.token)).resolves.toBeNull();
    await expect(signIn(NEW_PASSWORD)).resolves.toBeDefined();
    await expect(
      resetPassword(ctx, token, 'yet-another-password', requestFrom()),
    ).rejects.toMatchObject({ code: 'INVALID_LINK' });
    expect(await db.emailOutbox.count({ where: { template: 'passwordChanged' } })).toBe(1);
  });

  it('UC-A3 rejects expired links and only the newest link works', async () => {
    await createVerifiedUser(ctx, db, { email });
    await requestPasswordReset(ctx, email, requestFrom());
    const first = tokenFromLink(await latestEmailLink(db, 'passwordReset', email));
    await requestPasswordReset(ctx, email, requestFrom());
    const second = tokenFromLink(await latestEmailLink(db, 'passwordReset', email));

    await expect(resetPassword(ctx, first, NEW_PASSWORD, requestFrom())).rejects.toMatchObject({
      code: 'INVALID_LINK',
    });
    ctx.clock.advance(61 * 60_000);
    await expect(resetPassword(ctx, second, NEW_PASSWORD, requestFrom())).rejects.toMatchObject({
      code: 'INVALID_LINK',
    });
  });

  it('SR-1 applies the password rules to the new password', async () => {
    await createVerifiedUser(ctx, db, { email });
    await requestPasswordReset(ctx, email, requestFrom());
    const token = tokenFromLink(await latestEmailLink(db, 'passwordReset', email));

    await expect(resetPassword(ctx, token, 'short', requestFrom())).rejects.toMatchObject({
      fieldErrors: { password: 'password.tooShort' },
    });
  });
});

describe('verification resend (FR-1.1)', () => {
  it('resends only for unverified accounts', async () => {
    await signUpWithPassword(
      ctx,
      {
        role: 'CREATOR',
        name: 'Pending',
        email,
        password: STRONG_PASSWORD,
        acceptsMarketing: false,
        captchaToken: null,
      },
      requestFrom(),
    );
    await resendVerificationEmail(ctx, email, requestFrom());
    await resendVerificationEmail(ctx, 'verified-or-unknown@example.in', requestFrom());

    expect(await db.emailOutbox.count({ where: { template: 'verifyEmail' } })).toBe(2);
  });
});

describe('change password (FR-1.3)', () => {
  it('FR-1.3 requires the current password', async () => {
    const user = await createVerifiedUser(ctx, db, { email });
    const { session } = await signIn();
    const active = await resolveSession(ctx, session.token);

    await expect(
      changePassword(
        ctx,
        {
          userId: user.id,
          sessionId: active?.sessionId ?? '',
          currentPassword: 'not-my-password',
          newPassword: NEW_PASSWORD,
        },
        requestFrom(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { currentPassword: 'password.incorrect' } });
  });

  it('SR-2 keeps the current session and signs out the others', async () => {
    const user = await createVerifiedUser(ctx, db, { email });
    const current = await signIn();
    const other = await signIn();
    const active = await resolveSession(ctx, current.session.token);

    await changePassword(
      ctx,
      {
        userId: user.id,
        sessionId: active?.sessionId ?? '',
        currentPassword: STRONG_PASSWORD,
        newPassword: NEW_PASSWORD,
      },
      requestFrom(),
    );

    await expect(resolveSession(ctx, current.session.token)).resolves.not.toBeNull();
    await expect(resolveSession(ctx, other.session.token)).resolves.toBeNull();
    await expect(signIn(NEW_PASSWORD)).resolves.toBeDefined();
  });
});

describe('change email (UC-A4)', () => {
  it('UC-A4 changes the email only after the new address confirms, and tells the old one', async () => {
    const user = await createVerifiedUser(ctx, db, { email });

    await requestEmailChange(
      ctx,
      { userId: user.id, newEmail: 'Meera.New@Example.in', currentPassword: STRONG_PASSWORD },
      requestFrom(),
    );

    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(email);
    const notice = await db.emailOutbox.findFirstOrThrow({
      where: { template: 'emailChangeRequested' },
    });
    expect(notice.toAddress).toBe(email);
    expect(JSON.stringify(notice.payload)).not.toContain('meera.new@example.in');

    const token = tokenFromLink(
      await latestEmailLink(db, 'confirmEmailChange', 'meera.new@example.in'),
    );
    await confirmEmailChange(ctx, token, requestFrom());

    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(
      'meera.new@example.in',
    );
  });

  it('UC-A4 refuses an address already in use', async () => {
    const user = await createVerifiedUser(ctx, db, { email });
    await createVerifiedUser(ctx, db, { email: 'taken@example.in' });

    await expect(
      requestEmailChange(
        ctx,
        { userId: user.id, newEmail: 'taken@example.in', currentPassword: STRONG_PASSWORD },
        requestFrom(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { newEmail: 'email.unavailable' } });
  });

  it('UC-A4 keeps the old email if the address is taken before confirmation', async () => {
    const user = await createVerifiedUser(ctx, db, { email });
    await requestEmailChange(
      ctx,
      { userId: user.id, newEmail: 'race@example.in', currentPassword: STRONG_PASSWORD },
      requestFrom(),
    );
    const token = tokenFromLink(await latestEmailLink(db, 'confirmEmailChange', 'race@example.in'));
    await createVerifiedUser(ctx, db, { email: 'race@example.in' });

    await expect(confirmEmailChange(ctx, token, requestFrom())).rejects.toMatchObject({
      code: 'INVALID_LINK',
    });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(email);
  });
});
