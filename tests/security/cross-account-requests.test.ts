import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getRequest,
  listBrandRequests,
  respondToRequest,
  sendRequest,
  setBlocked,
  updateRequest,
  withdrawRequest,
} from '@/services/requests';
import {
  createBrandAndCreator,
  requestInput,
  sendTestRequest,
} from '../integration/collaboration-fixtures';
import { createBrandOwner, createSearchableCreator } from '../integration/discovery-fixtures';
import { createTestDatabaseClient } from '../integration/test-database';
import { createTestContext, resetDatabase, type TestContext } from '../integration/test-context';

const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

describe('requests across accounts (SR-5, SEC-2)', () => {
  it('SEC-2 another brand or creator gets "not found" for every request action, and it is logged', async () => {
    const { brand, creator } = await createBrandAndCreator(ctx, db);
    const requestId = await sendTestRequest(ctx, brand.id, creator.creatorId);
    const otherBrand = await createBrandOwner(ctx, db, 'intruder@other.in');
    await createSearchableCreator(ctx, db, { email: 'other-creator@example.in' });
    const otherCreator = await db.user.findUniqueOrThrow({
      where: { email: 'other-creator@example.in' },
    });

    // Functions, so each attempt starts only when awaited (no unhandled rejections).
    const attempts = [
      () => getRequest(ctx, { userId: otherBrand.id, requestId }),
      () => updateRequest(ctx, { ...requestInput(), userId: otherBrand.id, requestId }),
      () => withdrawRequest(ctx, { userId: otherBrand.id, requestId }),
      () => setBlocked(ctx, { userId: otherBrand.id, requestId, isBlocked: true }),
      () => getRequest(ctx, { userId: otherCreator.id, requestId }),
      () =>
        respondToRequest(ctx, {
          userId: otherCreator.id,
          requestId,
          version: 1,
          decision: 'accept',
        }),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }

    const stored = await db.collabRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(stored.status).toBe('OPEN');
    expect(await db.block.count()).toBe(0);
    expect(
      await db.auditEvent.count({
        where: {
          action: 'access.denied',
          actorUserId: { in: [otherBrand.id, otherCreator.id] },
        },
      }),
    ).toBe(attempts.length);
    expect((await listBrandRequests(ctx, { userId: otherBrand.id, page: 1 })).items).toEqual([]);
  });

  it('SR-5 creators cannot send requests and brands cannot answer them', async () => {
    const { brand, creator, creatorUser } = await createBrandAndCreator(ctx, db);
    const requestId = await sendTestRequest(ctx, brand.id, creator.creatorId);

    await expect(
      sendRequest(ctx, { ...requestInput(), userId: creatorUser.id, creatorId: creator.creatorId }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(
      respondToRequest(ctx, { userId: brand.id, requestId, version: 1, decision: 'accept' }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('SR-11 limits how many requests one user can send in a day', async () => {
    const { brand } = await createBrandAndCreator(ctx, db);
    const missing = 'no-such-creator';
    // Each attempt counts, even ones that fail later (here: unknown creator).
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await expect(
        sendRequest(ctx, { ...requestInput(), userId: brand.id, creatorId: missing }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }

    await expect(
      sendRequest(ctx, { ...requestInput(), userId: brand.id, creatorId: missing }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});
