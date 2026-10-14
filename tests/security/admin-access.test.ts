import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getAuditLog,
  getFreeBetaSetting,
  getPlatformMetrics,
  getUserDetail,
  refreshCreatorNow,
  reinstateUser,
  searchUsers,
  setFreeBeta,
  suspendUser,
  verifyUserEmail,
} from '@/services/admin';
import {
  closeReport,
  getChatForReview,
  getReport,
  listDisputes,
  listFlags,
  listReports,
  openChatForReview,
  resolveDispute,
  reviewFlag,
  setRatingHidden,
  warnUser,
} from '@/services/moderation';
import { addCreditPack, changeBrandPlan, extendTrial } from '@/services/plans';
import {
  closeDataRequest,
  deleteUnderageAccount,
  listDataRequests,
  scheduleAccountDeletion,
} from '@/services/privacy';
import { createBrandOwner, createSearchableCreator } from '../integration/discovery-fixtures';
import { createTestDatabaseClient } from '../integration/test-database';
import {
  createTestContext,
  requestFrom,
  resetDatabase,
  type TestContext,
} from '../integration/test-context';

const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

describe('admin console access (SR-5, SR-17, SEC-11)', () => {
  it('SR-5 brands and creators get NOT_ALLOWED for every admin function', async () => {
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    await createSearchableCreator(ctx, db, { email: 'asha@example.in' });
    const creator = await db.user.findUniqueOrThrow({ where: { email: 'asha@example.in' } });
    const brandId = (await db.brandMember.findUniqueOrThrow({ where: { userId: owner.id } }))
      .brandId;
    const request = requestFrom();

    for (const actor of [owner, creator]) {
      const attempts = [
        () => getPlatformMetrics(ctx, actor.id),
        () => searchUsers(ctx, { adminUserId: actor.id, filters: {}, page: 1 }),
        () => getUserDetail(ctx, { adminUserId: actor.id, userId: creator.id, request }),
        () =>
          suspendUser(ctx, {
            adminUserId: actor.id,
            userId: creator.id,
            reason: 'x'.repeat(10),
            request,
          }),
        () => reinstateUser(ctx, { adminUserId: actor.id, userId: creator.id, request }),
        () => verifyUserEmail(ctx, { adminUserId: actor.id, userId: creator.id, request }),
        () => refreshCreatorNow(ctx, { adminUserId: actor.id, userId: creator.id, request }),
        () => getFreeBetaSetting(ctx, actor.id),
        () => getAuditLog(ctx, { adminUserId: actor.id, filters: {}, page: 1 }),
        () => setFreeBeta(ctx, { adminUserId: actor.id, isActive: false, request }),
        () => changeBrandPlan(ctx, { adminUserId: actor.id, brandId, planCode: 'AGENCY' }),
        () => extendTrial(ctx, { adminUserId: actor.id, brandId, days: 30 }),
        () => addCreditPack(ctx, { adminUserId: actor.id, brandId, packCode: 'PACK_50' }),
        () => listReports(ctx, { adminUserId: actor.id, status: 'OPEN', page: 1 }),
        () => getReport(ctx, { adminUserId: actor.id, reportId: 'any' }),
        () =>
          closeReport(ctx, {
            adminUserId: actor.id,
            request,
            reportId: 'any',
            outcome: 'DISMISSED',
            note: 'not allowed',
          }),
        () =>
          setRatingHidden(ctx, { adminUserId: actor.id, request, ratingId: 'any', isHidden: true }),
        () =>
          warnUser(ctx, {
            adminUserId: actor.id,
            request,
            userId: creator.id,
            reason: 'not allowed',
          }),
        () =>
          openChatForReview(ctx, {
            adminUserId: actor.id,
            request,
            threadId: 'any',
            reportId: null,
            reason: 'not allowed',
          }),
        () => getChatForReview(ctx, { adminUserId: actor.id, grantId: 'any' }),
        () => listFlags(ctx, { adminUserId: actor.id, status: 'OPEN', page: 1 }),
        () =>
          reviewFlag(ctx, { adminUserId: actor.id, request, flagId: 'any', decision: 'CLEARED' }),
        () => listDisputes(ctx, { adminUserId: actor.id, status: 'OPEN', page: 1 }),
        () => listDataRequests(ctx, { adminUserId: actor.id, status: 'OPEN', page: 1 }),
        () =>
          closeDataRequest(ctx, {
            adminUserId: actor.id,
            requestId: 'any',
            outcome: 'COMPLETED',
            resolution: 'not allowed',
            request,
          }),
        () =>
          scheduleAccountDeletion(ctx, {
            adminUserId: actor.id,
            userId: creator.id,
            reason: 'not allowed',
            request,
          }),
        () =>
          deleteUnderageAccount(ctx, {
            adminUserId: actor.id,
            userId: creator.id,
            reason: 'not allowed',
            request,
          }),
        () =>
          resolveDispute(ctx, {
            adminUserId: actor.id,
            request,
            disputeId: 'any',
            decision: 'KEEP',
            note: 'not allowed',
          }),
      ];
      for (const attempt of attempts) {
        await expect(attempt()).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
      }
    }

    expect(await db.creditPack.count()).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: creator.id } })).status).toBe('ACTIVE');
  });

  it('SR-5 a suspended admin account can no longer act', async () => {
    const admin = await ctx.repos.users.create({
      email: 'admin@platform.in',
      passwordHash: null,
      name: 'Admin',
      role: 'ADMIN',
      status: 'SUSPENDED',
      emailVerifiedAt: ctx.clock.now(),
      countryCode: 'IN',
      locale: 'en',
    });

    await expect(getPlatformMetrics(ctx, admin.id)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });
});
