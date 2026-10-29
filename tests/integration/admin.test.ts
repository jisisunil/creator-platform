import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAdminAccount,
  getPlatformMetrics,
  getUserDetail,
  refreshCreatorNow,
  reinstateUser,
  searchUsers,
  setFreeBeta,
  suspendUser,
  verifyUserEmail,
} from '@/services/admin';
import { requestPasswordReset, signUpWithPassword } from '@/services/accounts';
import { searchCreators } from '@/services/discovery';
import { createAdmin } from './admin-fixtures';
import { acceptedRequest } from './collaboration-fixtures';
import { createBrandOwner, createSearchableCreator } from './discovery-fixtures';
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

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

const request = requestFrom('203.0.113.50');

describe('admin console (FR-13)', () => {
  it('FR-13.4 counts sign-ups, requests and open queues for the last 30 days', async () => {
    const admin = await createAdmin(ctx);
    await acceptedRequest(ctx, db);

    const metrics = await getPlatformMetrics(ctx, admin.id);

    expect(metrics).toMatchObject({
      windowDays: 30,
      signUps: 2,
      creators: 1,
      brands: 1,
      requestsSent: 1,
      dealsCompleted: 0,
      openReports: 0,
    });
  });

  it('shows the phase 2 success metrics: verified creators, active brands, acceptance', async () => {
    const admin = await createAdmin(ctx);
    expect(await getPlatformMetrics(ctx, admin.id)).toMatchObject({
      verifiedCreators: 0,
      activeBrands: 0,
      acceptanceRatePercent: null,
    });
    const { brand } = await acceptedRequest(ctx, db);
    await db.user.update({ where: { id: brand.id }, data: { lastLoginAt: ctx.clock.now() } });

    const metrics = await getPlatformMetrics(ctx, admin.id);

    expect(metrics).toMatchObject({
      verifiedCreators: 1,
      activeBrands: 1,
      requestOutcomes: { accepted: 1, declined: 0, expired: 0 },
      acceptanceRatePercent: 100,
    });
  });

  it('FR-13.1 finds users by name or email and filters by role', async () => {
    const admin = await createAdmin(ctx);
    await createBrandOwner(ctx, db, 'owner@spiceco.in');
    await createSearchableCreator(ctx, db, { email: 'asha@example.in' });

    const brands = await searchUsers(ctx, {
      adminUserId: admin.id,
      filters: { query: 'SPICECO', role: 'BRAND' },
      page: 1,
    });
    const creators = await searchUsers(ctx, {
      adminUserId: admin.id,
      filters: { role: 'CREATOR' },
      page: 1,
    });

    expect(brands.items.map((user) => user.email)).toEqual(['owner@spiceco.in']);
    expect(creators.items.map((user) => user.email)).toEqual(['asha@example.in']);
  });

  it('SEC-11 viewing a user is audited', async () => {
    const admin = await createAdmin(ctx);
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');

    const detail = await getUserDetail(ctx, { adminUserId: admin.id, userId: owner.id, request });

    expect(detail.brand).toMatchObject({ role: 'OWNER', planCode: 'PRO' });
    expect(
      await db.auditEvent.findFirstOrThrow({ where: { action: 'user.viewed' } }),
    ).toMatchObject({ category: 'ADMIN', actorUserId: admin.id, subjectUserId: owner.id });
  });

  it('UC-M1 suspending signs the user out, hides them from search, and is audited with the reason', async () => {
    const admin = await createAdmin(ctx);
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    await createSearchableCreator(ctx, db, { email: 'asha@example.in' });
    const creator = await db.user.findUniqueOrThrow({ where: { email: 'asha@example.in' } });
    await db.session.create({
      data: {
        userId: creator.id,
        tokenHash: 'hash',
        deviceHash: 'device',
        expiresAt: new Date(Date.now() + 86_400_000),
        lastSeenAt: new Date(),
      },
    });

    await suspendUser(ctx, {
      adminUserId: admin.id,
      userId: creator.id,
      reason: 'Fake followers confirmed',
      request,
    });

    expect(await db.session.count({ where: { userId: creator.id } })).toBe(0);
    const results = await searchCreators(ctx, {
      userId: brand.id,
      filters: {},
      sort: 'score',
      page: 1,
    });
    expect(results.total).toBe(0);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'user.suspended' } });
    expect(audit).toMatchObject({
      actorUserId: admin.id,
      subjectUserId: creator.id,
      ipAddress: '203.0.113.50',
    });
    expect(audit.metadata).toEqual({ reason: 'Fake followers confirmed' });

    await reinstateUser(ctx, { adminUserId: admin.id, userId: creator.id, request });
    expect((await db.user.findUniqueOrThrow({ where: { id: creator.id } })).status).toBe('ACTIVE');
  });

  it('SEC-11 admins cannot suspend themselves or other admins from the console', async () => {
    const admin = await createAdmin(ctx);
    const other = await createAdmin(ctx, 'second-admin@platform.in');

    for (const userId of [admin.id, other.id]) {
      await expect(
        suspendUser(ctx, { adminUserId: admin.id, userId, reason: 'Testing limits', request }),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    }
  });

  it('FR-13.1 confirms the email of a user stuck in verification', async () => {
    const admin = await createAdmin(ctx);
    await signUpWithPassword(
      ctx,
      {
        role: 'CREATOR',
        name: 'Stuck',
        email: 'stuck@example.in',
        password: STRONG_PASSWORD,
        acceptsMarketing: false,
        captchaToken: null,
      },
      requestFrom('198.51.100.77'),
    );
    const stuck = await db.user.findUniqueOrThrow({ where: { email: 'stuck@example.in' } });

    await verifyUserEmail(ctx, { adminUserId: admin.id, userId: stuck.id, request });

    expect(await db.user.findUniqueOrThrow({ where: { id: stuck.id } })).toMatchObject({
      status: 'ACTIVE',
      emailVerifiedAt: expect.any(Date),
    });
  });

  it('FR-13.2 queues a refresh of a creator’s accounts', async () => {
    const admin = await createAdmin(ctx);
    await createSearchableCreator(ctx, db, { email: 'asha@example.in' });
    const creator = await db.user.findUniqueOrThrow({ where: { email: 'asha@example.in' } });

    expect(
      await refreshCreatorNow(ctx, { adminUserId: admin.id, userId: creator.id, request }),
    ).toBe(1);
    expect(ctx.enqueuedJobs).toContain('social.refresh-account');
  });

  it('UC-B1 ending the free beta starts new brands on a trial', async () => {
    const admin = await createAdmin(ctx);

    await setFreeBeta(ctx, { adminUserId: admin.id, isActive: false, request });
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in', 'TRIAL');

    const setting = await db.platformSetting.findUniqueOrThrow({
      where: { key: 'isFreeBetaActive' },
    });
    expect(setting.value).toBe(false);
    expect(owner.id).toBeTruthy();
    expect(await db.auditEvent.count({ where: { action: 'setting.free-beta' } })).toBe(1);
  });
});

describe('creating admin accounts (SR-4, phase i)', () => {
  it('SR-4 creates a verified admin without a password, audited', async () => {
    const { userId } = await createAdminAccount(ctx, {
      email: ' Ops@Platform.in ',
      name: ' Ops Person ',
    });

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({
      email: 'ops@platform.in',
      name: 'Ops Person',
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash: null,
    });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(
      await db.auditEvent.count({ where: { action: 'admin.created', subjectUserId: userId } }),
    ).toBe(1);
  });

  it('SR-4 the new admin sets a password through the reset email', async () => {
    await createAdminAccount(ctx, { email: 'ops@platform.in', name: 'Ops Person' });

    await requestPasswordReset(ctx, 'ops@platform.in', request);

    expect(
      await db.emailOutbox.count({
        where: { toAddress: 'ops@platform.in', template: 'passwordReset' },
      }),
    ).toBe(1);
  });

  it('refuses an email that already has an account', async () => {
    await createAdminAccount(ctx, { email: 'ops@platform.in', name: 'Ops Person' });

    await expect(
      createAdminAccount(ctx, { email: 'OPS@platform.in', name: 'Someone Else' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});
