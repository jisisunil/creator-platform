import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signUpWithPassword } from '@/services/accounts';
import { dispatchPendingEmails, MAX_EMAIL_ATTEMPTS } from '@/services/email';
import { purgeExpiredSecurityData, purgeUnverifiedAccounts } from '@/services/retention';
import { createVerifiedUser } from './accounts/fixtures';
import { createTestDatabaseClient } from './test-database';
import {
  createTestContext,
  requestFrom,
  resetDatabase,
  STRONG_PASSWORD,
  type TestContext,
} from './test-context';

const db = createTestDatabaseClient();
let ctx: TestContext;
const DAY = 24 * 60 * 60_000;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

async function signUpUnverified(email: string) {
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
    requestFrom(`192.0.2.${email.length}`),
  );
}

describe('email dispatch (FR-12 groundwork, NFR-10)', () => {
  it('sends queued emails in the recipient language and clears one-time links afterwards', async () => {
    await signUpUnverified('asha@example.in');
    const send = vi.fn(async () => undefined);

    const counts = await dispatchPendingEmails({ ...ctx, emailSender: { send } }, 10);

    expect(counts).toEqual({ sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'asha@example.in', subject: 'Verify your email' }),
    );
    const stored = await db.emailOutbox.findFirstOrThrow();
    expect(stored).toMatchObject({ status: 'SENT', payload: null });
  });

  it('retries failed sends and gives up after the maximum attempts', async () => {
    await signUpUnverified('asha@example.in');
    const send = vi.fn(async () => {
      throw new Error('SMTP down');
    });

    for (let attempt = 0; attempt < MAX_EMAIL_ATTEMPTS; attempt += 1) {
      await dispatchPendingEmails({ ...ctx, emailSender: { send } }, 1);
    }

    const stored = await db.emailOutbox.findFirstOrThrow();
    expect(stored).toMatchObject({ status: 'FAILED', attempts: MAX_EMAIL_ATTEMPTS, payload: null });
    await expect(dispatchPendingEmails({ ...ctx, emailSender: { send } }, 1)).resolves.toEqual({
      sent: 0,
      failed: 0,
    });
  });
});

describe('retention (UC-A1, PR-9, SR-13)', () => {
  // Row timestamps come from the database clock, so tests back-date rows rather than
  // relying on the real date matching the fake clock.
  async function backdateUser(email: string, days: number) {
    await db.user.update({
      where: { email },
      data: { createdAt: new Date(ctx.clock.now().getTime() - days * DAY) },
    });
  }

  it('UC-A1 deletes accounts still unverified after 7 days, and nothing else', async () => {
    await signUpUnverified('old@example.in');
    await signUpUnverified('recent@example.in');
    await createVerifiedUser(ctx, db, { email: 'verified@example.in' });
    await backdateUser('old@example.in', 8);
    await backdateUser('recent@example.in', 6);
    await backdateUser('verified@example.in', 30);

    const result = await purgeUnverifiedAccounts(ctx);

    expect(result).toEqual({ deletedAccounts: 1 });
    const remaining = (await db.user.findMany({ select: { email: true } })).map((u) => u.email);
    expect(remaining.sort()).toEqual(['recent@example.in', 'verified@example.in']);
  });

  it('SR-13 keeps audit logs for a year, then deletes them with expired security data', async () => {
    await signUpUnverified('a@example.in'); // leaves a verification link that expires in 48 h
    ctx.clock.advance(3 * DAY);
    const now = ctx.clock.now().getTime();
    const newest = await db.auditEvent.create({
      data: { category: 'SECURITY', action: 'test.recent', createdAt: new Date(now - 364 * DAY) },
    });
    const oldest = await db.auditEvent.create({
      data: { category: 'SECURITY', action: 'test.old', createdAt: new Date(now - 366 * DAY) },
    });

    const counts = await purgeExpiredSecurityData(ctx);

    expect(counts.oneTimeLinks).toBe(1);
    expect(await db.oneTimeToken.count()).toBe(0);
    const remaining = await db.auditEvent.findMany({ select: { id: true } });
    expect(remaining.map((event) => event.id)).toContain(newest.id);
    expect(remaining.map((event) => event.id)).not.toContain(oldest.id);
  });
});
