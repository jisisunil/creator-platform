import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addPostLink, confirmPaymentReceived, markDealPaid } from '@/services/deals';
import {
  getBrandReputation,
  getCreatorReputation,
  getDealRatings,
  reportRating,
  submitRating,
} from '@/services/ratings';
import { getRequest } from '@/services/requests';
import { acceptedRequest, CREATOR_CHANNEL_ID } from './collaboration-fixtures';
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

const BRAND_SCORES = { contentQuality: 5, onTime: 4, communication: 5 };
const CREATOR_SCORES = { clearBrief: 4, paidOnTime: 5, communication: 4 };

/** A deal taken all the way to completed. */
async function completedDeal() {
  const parties = await acceptedRequest(ctx, db);
  const dealId =
    (await getRequest(ctx, { userId: parties.brand.id, requestId: parties.requestId })).dealId ??
    '';
  await addPostLink(ctx, {
    userId: parties.creatorUser.id,
    dealId,
    url: `https://mock.social/${CREATOR_CHANNEL_ID}/reel`,
  });
  await markDealPaid(ctx, { userId: parties.brand.id, dealId });
  await confirmPaymentReceived(ctx, { userId: parties.creatorUser.id, dealId });
  return { ...parties, dealId };
}

describe('ratings (FR-10, UC-R7)', () => {
  it('FR-10.1 asks both sides to rate when a deal completes', async () => {
    await completedDeal();

    const emails = await db.emailOutbox.findMany({ where: { template: 'ratingRequested' } });
    expect(emails.map((email) => email.toAddress).sort()).toEqual([
      'creator@example.in',
      'owner@spiceco.in',
    ]);
  });

  it('FR-10.2 only completed deals can be rated', async () => {
    const { brand, requestId } = await acceptedRequest(ctx, db);
    const dealId = (await getRequest(ctx, { userId: brand.id, requestId })).dealId ?? '';

    await expect(
      submitRating(ctx, { userId: brand.id, dealId, scores: BRAND_SCORES, comment: '' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('FR-10.2 both ratings show as soon as both sides have rated', async () => {
    const { brand, creator, creatorUser, dealId } = await completedDeal();

    await submitRating(ctx, {
      userId: brand.id,
      dealId,
      scores: BRAND_SCORES,
      comment: 'Lovely reels, very professional',
    });
    expect((await getDealRatings(ctx, { userId: creatorUser.id, dealId })).theirs).toBeNull();
    await submitRating(ctx, {
      userId: creatorUser.id,
      dealId,
      scores: CREATOR_SCORES,
      comment: '',
    });

    const creatorView = await getDealRatings(ctx, { userId: creatorUser.id, dealId });
    expect(creatorView.theirs).toMatchObject({
      averageTenths: 47,
      comment: 'Lovely reels, very professional',
    });
    expect(creatorView.canRate).toBe(false);
    expect(await getCreatorReputation(ctx, creator.creatorId)).toMatchObject({
      averageTenths: 47,
      count: 1,
      recent: [expect.objectContaining({ comment: 'Lovely reels, very professional' })],
    });
    const brandId = (await db.brandMember.findUniqueOrThrow({ where: { userId: brand.id } }))
      .brandId;
    expect(await getBrandReputation(ctx, brandId)).toMatchObject({ averageTenths: 43, count: 1 });
  });

  it('UC-R7 a rating shows 14 days after completion when the other side never rates', async () => {
    const { brand, creator, creatorUser, dealId } = await completedDeal();
    await submitRating(ctx, { userId: brand.id, dealId, scores: BRAND_SCORES, comment: '' });

    expect((await getDealRatings(ctx, { userId: brand.id, dealId })).revealAt).not.toBeNull();
    expect((await getCreatorReputation(ctx, creator.creatorId)).count).toBe(0);

    ctx.clock.advance(14 * DAY_MS);

    expect((await getDealRatings(ctx, { userId: creatorUser.id, dealId })).theirs).not.toBeNull();
    expect((await getCreatorReputation(ctx, creator.creatorId)).count).toBe(1);
  });

  it('FR-10.2 one rating per deal per side', async () => {
    const { brand, dealId } = await completedDeal();
    await submitRating(ctx, { userId: brand.id, dealId, scores: BRAND_SCORES, comment: '' });

    await expect(
      submitRating(ctx, { userId: brand.id, dealId, scores: BRAND_SCORES, comment: '' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('FR-10.1 rejects the other side’s criteria and contact details in comments', async () => {
    const { brand, dealId } = await completedDeal();

    await expect(
      submitRating(ctx, { userId: brand.id, dealId, scores: CREATOR_SCORES, comment: '' }),
    ).rejects.toMatchObject({ fieldErrors: { scores: 'rating.allCriteria' } });
    await expect(
      submitRating(ctx, {
        userId: brand.id,
        dealId,
        scores: BRAND_SCORES,
        comment: 'Call her on 98765 43210',
      }),
    ).rejects.toMatchObject({ fieldErrors: { comment: 'profile.noContactDetails' } });
  });

  it('FR-10.3 the rated side can report an unfair rating; hidden ratings leave the profile', async () => {
    const { brand, creator, creatorUser, dealId } = await completedDeal();
    await submitRating(ctx, {
      userId: brand.id,
      dealId,
      scores: { contentQuality: 1, onTime: 1, communication: 1 },
      comment: 'Terrible',
    });
    await submitRating(ctx, {
      userId: creatorUser.id,
      dealId,
      scores: CREATOR_SCORES,
      comment: '',
    });
    const ratingId =
      (await getDealRatings(ctx, { userId: creatorUser.id, dealId })).theirs?.id ?? '';

    await expect(
      reportRating(ctx, { userId: brand.id, ratingId, reason: 'Reporting my own rating' }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await reportRating(ctx, {
      userId: creatorUser.id,
      ratingId,
      reason: 'Retaliation for my rating',
    });

    expect(await db.report.findFirstOrThrow()).toMatchObject({
      targetType: 'RATING',
      targetId: ratingId,
      reporterUserId: creatorUser.id,
    });
    await db.rating.update({ where: { id: ratingId }, data: { isHidden: true } });
    expect((await getCreatorReputation(ctx, creator.creatorId)).count).toBe(0);
  });
});
