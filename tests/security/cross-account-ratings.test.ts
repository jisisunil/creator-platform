import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addPostLink, confirmPaymentReceived, markDealPaid } from '@/services/deals';
import { getDealRatings, reportRating, submitRating } from '@/services/ratings';
import { getRequest } from '@/services/requests';
import { acceptedRequest, CREATOR_CHANNEL_ID } from '../integration/collaboration-fixtures';
import { createBrandOwner } from '../integration/discovery-fixtures';
import { createTestDatabaseClient } from '../integration/test-database';
import { createTestContext, resetDatabase, type TestContext } from '../integration/test-context';

const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

describe('ratings across accounts (SR-5, SEC-2)', () => {
  it('SEC-2 an outsider cannot rate, read or report a deal’s ratings', async () => {
    const { brand, creatorUser, requestId } = await acceptedRequest(ctx, db);
    const dealId = (await getRequest(ctx, { userId: brand.id, requestId })).dealId ?? '';
    await addPostLink(ctx, {
      userId: creatorUser.id,
      dealId,
      url: `https://mock.social/${CREATOR_CHANNEL_ID}/reel`,
    });
    await markDealPaid(ctx, { userId: brand.id, dealId });
    await confirmPaymentReceived(ctx, { userId: creatorUser.id, dealId });
    await submitRating(ctx, {
      userId: brand.id,
      dealId,
      scores: { contentQuality: 5, onTime: 5, communication: 5 },
      comment: '',
    });
    const ratingId = (await db.rating.findFirstOrThrow()).id;
    const outsider = await createBrandOwner(ctx, db, 'intruder@other.in');

    const attempts = [
      () =>
        submitRating(ctx, {
          userId: outsider.id,
          dealId,
          scores: { contentQuality: 1, onTime: 1, communication: 1 },
          comment: '',
        }),
      () => getDealRatings(ctx, { userId: outsider.id, dealId }),
      () => reportRating(ctx, { userId: outsider.id, ratingId, reason: 'Not my deal at all' }),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }

    expect(await db.rating.count()).toBe(1);
    expect(await db.report.count()).toBe(0);
    expect(
      await db.auditEvent.count({ where: { action: 'access.denied', actorUserId: outsider.id } }),
    ).toBe(attempts.length);
  });
});
