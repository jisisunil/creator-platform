import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { signInWithPassword } from '@/services/accounts';
import { getAuditLog } from '@/services/admin';
import {
  checkDataRequestDeadlines,
  checkSocialDataHealth,
  runSecurityChecks,
} from '@/services/monitoring';
import { handleInactiveAccounts, requestCorrection } from '@/services/privacy';
import { reduceOldSnapshots } from '@/services/retention';
import { createVerifiedUser } from './accounts/fixtures';
import { createAdmin } from './admin-fixtures';
import { createSearchableCreator } from './discovery-fixtures';
import { createTestDatabaseClient } from './test-database';
import {
  createTestContext,
  requestFrom,
  resetDatabase,
  STRONG_PASSWORD,
  type TestContext,
} from './test-context';

const DAY_MS = 86_400_000;
const THREE_YEARS_MS = 3 * 365 * DAY_MS;
const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

describe('inactive accounts (PR-9)', () => {
  it('PR-9 warns 30 days before 3 years of inactivity, then deletes', async () => {
    const user = await createVerifiedUser(ctx, db, { email: 'quiet@example.in' });
    // Sign-up time comes from the database clock; align it with the test clock.
    await db.user.update({ where: { id: user.id }, data: { createdAt: ctx.clock.now() } });

    ctx.clock.advance(THREE_YEARS_MS - 31 * DAY_MS);
    expect(await handleInactiveAccounts(ctx)).toEqual({ warned: 0, deleted: 0 });
    ctx.clock.advance(2 * DAY_MS);
    expect(await handleInactiveAccounts(ctx)).toEqual({ warned: 1, deleted: 0 });
    expect(
      await db.emailOutbox.count({
        where: { template: 'inactiveAccountWarning', toAddress: 'quiet@example.in' },
      }),
    ).toBe(1);
    expect(await handleInactiveAccounts(ctx)).toEqual({ warned: 0, deleted: 0 });

    ctx.clock.advance(30 * DAY_MS);
    expect(await handleInactiveAccounts(ctx)).toEqual({ warned: 0, deleted: 1 });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe('ANONYMISED');
  });

  it('PR-9 signing in after the warning keeps the account', async () => {
    const user = await createVerifiedUser(ctx, db, { email: 'back@example.in' });
    await db.user.update({ where: { id: user.id }, data: { createdAt: ctx.clock.now() } });
    ctx.clock.advance(THREE_YEARS_MS - 20 * DAY_MS);
    await handleInactiveAccounts(ctx);

    await signInWithPassword(
      ctx,
      { email: 'back@example.in', password: STRONG_PASSWORD, captchaToken: null },
      requestFrom('198.51.100.200'),
    );
    ctx.clock.advance(40 * DAY_MS);

    expect(await handleInactiveAccounts(ctx)).toEqual({ warned: 0, deleted: 0 });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe('ACTIVE');
  });
});

describe('old stats (data inventory)', () => {
  it('keeps one snapshot a month for stats older than 2 years', async () => {
    const { creatorId } = await createSearchableCreator(ctx, db, { email: 'asha@example.in' });
    const account = await db.socialAccount.findFirstOrThrow({ where: { creatorId } });
    const old = (day: number) => new Date(Date.UTC(2023, 0, day));
    for (const day of [3, 10, 20, 34, 40]) {
      await db.statsSnapshot.create({
        data: {
          socialAccountId: account.id,
          capturedOn: old(day),
          followers: 1000 + day,
          mediaCount: 10,
          posts30d: 2,
          likes30d: 20,
          comments30d: 2,
        },
      });
    }

    expect(await reduceOldSnapshots(ctx)).toEqual({ snapshotsRemoved: 3 });

    const kept = await db.statsSnapshot.findMany({
      where: { socialAccountId: account.id, capturedOn: { lt: new Date('2024-01-01') } },
      orderBy: { capturedOn: 'asc' },
    });
    expect(kept.map((row) => row.capturedOn.toISOString().slice(0, 10))).toEqual([
      '2023-01-03',
      '2023-02-03',
    ]);
  });
});

describe('monitoring (SR-14)', () => {
  const deps = () => ({ ...ctx, alertEmail: 'ops@platform.in' });

  it('SR-14 alerts on a failed sign-in spike and emails the ops address', async () => {
    for (let index = 0; index < 50; index += 1) {
      await ctx.repos.audit.record({ category: 'SECURITY', action: 'login.failure' });
    }

    expect(await runSecurityChecks(deps())).toEqual({ alerts: 1 });
    expect(
      await db.emailOutbox.findFirstOrThrow({ where: { template: 'opsAlert' } }),
    ).toMatchObject({
      toAddress: 'ops@platform.in',
    });
  });

  it('SR-14 alerts on admin actions outside working hours', async () => {
    const admin = await createAdmin(ctx);
    ctx.clock.advance(0);
    await db.auditEvent.create({
      data: {
        category: 'ADMIN',
        action: 'user.viewed',
        actorUserId: admin.id,
        createdAt: new Date(ctx.clock.now().getTime() - 60_000),
      },
    });
    // The test clock starts at 10:00 UTC = 15:30 India time: inside working hours.
    expect(await runSecurityChecks(deps())).toEqual({ alerts: 0 });

    ctx.clock.advance(12 * 3_600_000); // 03:30 India time
    await db.auditEvent.create({
      data: {
        category: 'ADMIN',
        action: 'user.viewed',
        actorUserId: admin.id,
        createdAt: new Date(ctx.clock.now().getTime() - 60_000),
      },
    });
    expect(await runSecurityChecks(deps())).toEqual({ alerts: 1 });
  });

  it('PR-5 alerts when data requests are overdue', async () => {
    const user = await createVerifiedUser(ctx, db, { email: 'asha@example.in' });
    await requestCorrection(ctx, { userId: user.id, details: 'Please fix my follower count' });

    ctx.clock.advance(26 * DAY_MS);
    expect(await checkDataRequestDeadlines(deps())).toEqual({ alerts: 1 });
    ctx.clock.advance(5 * DAY_MS);
    expect(await checkDataRequestDeadlines(deps())).toEqual({ alerts: 1 });
    const alerts = await db.emailOutbox.findMany({ where: { template: 'opsAlert' } });
    expect(alerts.map((email) => (email.payload as { alert: string }).alert)).toEqual([
      'data-requests-due-soon',
      'data-requests-overdue',
    ]);
  });
});

describe('social data health (NFR-3, NFR-13)', () => {
  const deps = () => ({ ...ctx, alertEmail: 'ops@platform.in' });
  const hoursAgo = (hours: number) => new Date(ctx.clock.now().getTime() - hours * 3_600_000);

  async function account() {
    const { creatorId } = await createSearchableCreator(ctx, db, { email: 'c@example.in' });
    return db.socialAccount.findFirstOrThrow({ where: { creatorId } });
  }

  it('NFR-3 stays quiet while every account was refreshed in the last 48 hours', async () => {
    const { id } = await account();
    await db.socialAccount.update({ where: { id }, data: { lastRefreshedAt: hoursAgo(30) } });

    expect(await checkSocialDataHealth(deps())).toEqual({ alerts: 0 });
  });

  it('NFR-13 alerts when an account is waiting for platform API quota', async () => {
    const { id } = await account();
    await db.socialAccount.update({
      where: { id },
      data: { lastRefreshedAt: hoursAgo(30), lastRefreshError: 'QUOTA_EXCEEDED' },
    });

    expect(await checkSocialDataHealth(deps())).toEqual({ alerts: 1 });
    const alert = await db.emailOutbox.findFirstOrThrow({ where: { template: 'opsAlert' } });
    expect(alert.payload).toMatchObject({
      alert: 'api-quota-exceeded',
      details: 'Accounts waiting for API quota: YOUTUBE 1',
    });
  });

  it('NFR-3 alerts when stats are older than 48 hours', async () => {
    const { id } = await account();
    await db.socialAccount.update({ where: { id }, data: { lastRefreshedAt: hoursAgo(49) } });

    expect(await checkSocialDataHealth(deps())).toEqual({ alerts: 1 });
    const alert = await db.emailOutbox.findFirstOrThrow({ where: { template: 'opsAlert' } });
    expect(alert.payload).toMatchObject({ alert: 'stale-social-data' });
  });
});

describe('audit log (FR-13.3)', () => {
  it('FR-13.3 lists events newest first and filters by category and action', async () => {
    const admin = await createAdmin(ctx);
    await ctx.repos.audit.record({ category: 'SECURITY', action: 'login.failure' });
    await ctx.repos.audit.record({
      category: 'ADMIN',
      action: 'user.viewed',
      actorUserId: admin.id,
    });

    const adminEvents = await getAuditLog(ctx, {
      adminUserId: admin.id,
      filters: { category: 'ADMIN' },
      page: 1,
    });
    const logins = await getAuditLog(ctx, {
      adminUserId: admin.id,
      filters: { action: 'login.' },
      page: 1,
    });

    expect(adminEvents.items.map((event) => [event.action, event.actorName])).toEqual([
      ['user.viewed', 'Admin'],
    ]);
    expect(logins.items.map((event) => event.action)).toContain('login.failure');
  });
});
