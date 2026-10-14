import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  expireRequests,
  getRequest,
  getRequestFormContext,
  listBrandRequests,
  listCreatorRequests,
  respondToRequest,
  setBlocked,
  updateRequest,
  withdrawRequest,
} from '@/services/requests';
import { createBrandAndCreator, requestInput, sendTestRequest } from './collaboration-fixtures';
import { createSearchableCreator } from './discovery-fixtures';
import { createTestDatabaseClient } from './test-database';
import { createTestContext, resetDatabase, type TestContext } from './test-context';

const DAY_MS = 86_400_000;
const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

/** Sets the contact-request limit of the plan the brand owner's brand is on. */
async function setRequestLimit(brandUserId: string, limit: number): Promise<void> {
  const member = await db.brandMember.findUniqueOrThrow({
    where: { userId: brandUserId },
    select: { brand: { select: { planId: true } } },
  });
  await db.plan.update({
    where: { id: member.brand.planId },
    data: { contactRequestsPerPeriod: limit },
  });
}

describe('sending requests (FR-7.1, UC-R1)', () => {
  it('UC-R1 sends a request with its terms and emails the creator', async () => {
    const { brand, creator, creatorUser } = await createBrandAndCreator(ctx, db);

    const requestId = await sendTestRequest(ctx, brand.id, creator.creatorId);

    const view = await getRequest(ctx, { userId: creatorUser.id, requestId });
    expect(view).toMatchObject({
      status: 'OPEN',
      campaignName: 'Diwali 2026',
      deliverables: [{ deliverable: 'REEL', quantity: 2 }],
      budgetMinor: 2_500_000,
      currencyCode: 'INR',
      usageRights: 'BRAND_ORGANIC',
      canRespond: true,
      viewerSide: 'CREATOR',
    });
    expect(view.expiresAt.toISOString()).toBe('2026-10-23T10:00:00.000Z');
    const email = await db.emailOutbox.findFirstOrThrow({ where: { template: 'requestReceived' } });
    expect(email.toAddress).toBe('creator@example.in');
    expect(ctx.enqueuedJobs).toContain('email.dispatch');
  });

  it('UC-R1 groups requests with the same campaign name into one campaign', async () => {
    const { brand, creator } = await createBrandAndCreator(ctx, db);
    const other = await createSearchableCreator(ctx, db, { email: 'second@example.in' });

    await sendTestRequest(ctx, brand.id, creator.creatorId);
    await sendTestRequest(ctx, brand.id, other.creatorId);

    expect(await db.campaign.count()).toBe(1);
    const context = await getRequestFormContext(ctx, brand.id);
    expect(context.campaignNames).toEqual(['Diwali 2026']);
    expect(context.allowance).toMatchObject({ used: 2 });
  });

  it('UC-R1 blocks the request when the plan limit is reached', async () => {
    const { brand, creator } = await createBrandAndCreator(ctx, db);
    const other = await createSearchableCreator(ctx, db, { email: 'second@example.in' });
    await setRequestLimit(brand.id, 1);
    await sendTestRequest(ctx, brand.id, creator.creatorId);

    await expect(sendTestRequest(ctx, brand.id, other.creatorId)).rejects.toMatchObject({
      code: 'PLAN_LIMIT_REACHED',
    });
    expect(await db.collabRequest.count()).toBe(1);
  });

  it('UC-B2 parallel sends cannot use more requests than the plan allows', async () => {
    const { brand, creator } = await createBrandAndCreator(ctx, db);
    const other = await createSearchableCreator(ctx, db, { email: 'second@example.in' });
    await setRequestLimit(brand.id, 1);

    const results = await Promise.allSettled([
      sendTestRequest(ctx, brand.id, creator.creatorId),
      sendTestRequest(ctx, brand.id, other.creatorId),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.collabRequest.count()).toBe(1);
  });

  it('FR-7.3 withdrawn and declined requests still count towards the plan', async () => {
    const { brand, creator } = await createBrandAndCreator(ctx, db);
    await setRequestLimit(brand.id, 1);
    const requestId = await sendTestRequest(ctx, brand.id, creator.creatorId);
    await withdrawRequest(ctx, { userId: brand.id, requestId });

    await expect(sendTestRequest(ctx, brand.id, creator.creatorId)).rejects.toMatchObject({
      code: 'PLAN_LIMIT_REACHED',
    });
  });

  it('FR-7.3 a monthly plan gets its allowance back in the next period', async () => {
    const { brand, creator } = await createBrandAndCreator(ctx, db);
    const other = await createSearchableCreator(ctx, db, { email: 'second@example.in' });
    await setRequestLimit(brand.id, 1);
    await sendTestRequest(ctx, brand.id, creator.creatorId);

    ctx.clock.advance(32 * DAY_MS);

    await expect(
      sendTestRequest(ctx, brand.id, other.creatorId, { deadline: '2026-12-20' }),
    ).resolves.toEqual(expect.any(String));
  });

  it('UC-R1 a creator not open to collaborations is "not available"', async () => {
    const { brand } = await createBrandAndCreator(ctx, db);
    const closed = await createSearchableCreator(ctx, db, {
      email: 'closed@example.in',
      isOpen: false,
    });

    await expect(sendTestRequest(ctx, brand.id, closed.creatorId)).rejects.toMatchObject({
      code: 'NOT_AVAILABLE',
    });
  });

  it('UC-R1 a creator who blocked the brand gets the same generic "not available"', async () => {
    const { brand, creator, creatorUser } = await createBrandAndCreator(ctx, db);
    const requestId = await sendTestRequest(ctx, brand.id, creator.creatorId);
    await setBlocked(ctx, { userId: creatorUser.id, requestId, isBlocked: true });

    await expect(sendTestRequest(ctx, brand.id, creator.creatorId)).rejects.toMatchObject({
      code: 'NOT_AVAILABLE',
    });
    // Blocking also declined the open request.
    expect((await getRequest(ctx, { userId: brand.id, requestId })).status).toBe('DECLINED');
  });

  it('UC-R1 a second open request to the same creator is a conflict', async () => {
    const { brand, creator } = await createBrandAndCreator(ctx, db);
    await sendTestRequest(ctx, brand.id, creator.creatorId);

    await expect(sendTestRequest(ctx, brand.id, creator.creatorId)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('UC-R1 a new request is allowed once the previous one was answered', async () => {
    const { brand, creator, creatorUser } = await createBrandAndCreator(ctx, db);
    const first = await sendTestRequest(ctx, brand.id, creator.creatorId);
    await respondToRequest(ctx, {
      userId: creatorUser.id,
      requestId: first,
      version: 1,
      decision: 'decline',
    });

    await expect(sendTestRequest(ctx, brand.id, creator.creatorId)).resolves.not.toBe(first);
  });

  it('FR-7.1 rejects a deadline in the past', async () => {
    const { brand, creator } = await createBrandAndCreator(ctx, db);

    await expect(
      sendTestRequest(ctx, brand.id, creator.creatorId, { deadline: '2026-10-01' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      fieldErrors: { deadline: 'request.invalidDeadline' },
    });
  });
});

describe('answering requests (FR-7.2, UC-R2)', () => {
  it('UC-R2 the creator accepts and the brand is emailed', async () => {
    const { brand, creator, creatorUser } = await createBrandAndCreator(ctx, db);
    const requestId = await sendTestRequest(ctx, brand.id, creator.creatorId);

    await respondToRequest(ctx, {
      userId: creatorUser.id,
      requestId,
      version: 1,
      decision: 'accept',
    });

    expect((await getRequest(ctx, { userId: brand.id, requestId })).status).toBe('ACCEPTED');
    const email = await db.emailOutbox.findFirstOrThrow({ where: { template: 'requestAccepted' } });
    expect(email.toAddress).toBe('owner@spiceco.in');
  });

  it('UC-R2 a decline reason is shown to the brand', async () => {
    const { brand, creator, creatorUser } = await createBrandAndCreator(ctx, db);
    const requestId = await sendTestRequest(ctx, brand.id, creator.creatorId);

    await respondToRequest(ctx, {
      userId: creatorUser.id,
      requestId,
      version: 1,
      decision: 'decline',
      reason: 'Fully booked until January',
    });

    expect(await getRequest(ctx, { userId: brand.id, requestId })).toMatchObject({
      status: 'DECLINED',
      declineReason: 'Fully booked until January',
    });
  });

  it('UC-R2 an expired request cannot be accepted', async () => {
    const { brand, creator, creatorUser } = await createBrandAndCreator(ctx, db);
    const requestId = await sendTestRequest(ctx, brand.id, creator.creatorId);
    ctx.clock.advance(15 * DAY_MS);

    await expect(
      respondToRequest(ctx, { userId: creatorUser.id, requestId, version: 1, decision: 'accept' }),
    ).rejects.toMatchObject({ code: 'REQUEST_EXPIRED' });
  });

  it('FR-7.2 the expiry job closes requests left for 14 days', async () => {
    const { brand, creator } = await createBrandAndCreator(ctx, db);
    const requestId = await sendTestRequest(ctx, brand.id, creator.creatorId);
    ctx.clock.advance(14 * DAY_MS);

    expect(await expireRequests(ctx)).toEqual({ expired: 1 });

    const stored = await db.collabRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(stored).toMatchObject({ status: 'EXPIRED', openPairKey: null });
  });

  it('UC-R2 the creator must answer the latest version after the brand changes the budget', async () => {
    const { brand, creator, creatorUser } = await createBrandAndCreator(ctx, db);
    const requestId = await sendTestRequest(ctx, brand.id, creator.creatorId);
    await updateRequest(ctx, {
      ...requestInput({ budgetRupees: 15_000 }),
      userId: brand.id,
      requestId,
    });

    await expect(
      respondToRequest(ctx, { userId: creatorUser.id, requestId, version: 1, decision: 'accept' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const latest = await getRequest(ctx, { userId: creatorUser.id, requestId });
    expect(latest).toMatchObject({ version: 2, budgetMinor: 1_500_000 });
    await respondToRequest(ctx, {
      userId: creatorUser.id,
      requestId,
      version: 2,
      decision: 'accept',
    });
    expect((await getRequest(ctx, { userId: brand.id, requestId })).status).toBe('ACCEPTED');
  });

  it('UC-R2 a brand with no active members left is "not available"', async () => {
    const { brand, creator, creatorUser } = await createBrandAndCreator(ctx, db);
    const requestId = await sendTestRequest(ctx, brand.id, creator.creatorId);
    await db.user.update({ where: { id: brand.id }, data: { status: 'SUSPENDED' } });

    await expect(
      respondToRequest(ctx, { userId: creatorUser.id, requestId, version: 1, decision: 'accept' }),
    ).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
  });

  it('UC-R2 an answered request cannot be withdrawn or edited', async () => {
    const { brand, creator, creatorUser } = await createBrandAndCreator(ctx, db);
    const requestId = await sendTestRequest(ctx, brand.id, creator.creatorId);
    await respondToRequest(ctx, {
      userId: creatorUser.id,
      requestId,
      version: 1,
      decision: 'accept',
    });

    await expect(withdrawRequest(ctx, { userId: brand.id, requestId })).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(
      updateRequest(ctx, { ...requestInput(), userId: brand.id, requestId }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('request lists', () => {
  it('lists open requests first for the creator and newest first for the brand', async () => {
    const { brand, creator, creatorUser } = await createBrandAndCreator(ctx, db);
    const answered = await sendTestRequest(ctx, brand.id, creator.creatorId, {
      campaignName: 'Older',
    });
    await respondToRequest(ctx, {
      userId: creatorUser.id,
      requestId: answered,
      version: 1,
      decision: 'decline',
    });
    ctx.clock.advance(60_000);
    await sendTestRequest(ctx, brand.id, creator.creatorId, { campaignName: 'Newer' });

    const inbox = await listCreatorRequests(ctx, { userId: creatorUser.id, page: 1 });
    const sent = await listBrandRequests(ctx, { userId: brand.id, page: 1 });

    expect(inbox.items.map((item) => [item.campaignName, item.status])).toEqual([
      ['Newer', 'OPEN'],
      ['Older', 'DECLINED'],
    ]);
    expect(sent.items.map((item) => item.campaignName)).toEqual(['Newer', 'Older']);
  });
});
