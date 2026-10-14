import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getCampaignReport, listCampaigns } from '@/services/campaigns';
import {
  addPostLink,
  cancelDeal,
  getDeal,
  listDeals,
  markDealPaid,
  updateDealTerms,
} from '@/services/deals';
import { getRequest } from '@/services/requests';
import { acceptedRequest, CREATOR_CHANNEL_ID } from '../integration/collaboration-fixtures';
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

describe('deals and campaigns across accounts (SR-5, SEC-2)', () => {
  it('SEC-2 another brand or creator gets "not found" for a deal and a campaign, and it is logged', async () => {
    const { brand, requestId } = await acceptedRequest(ctx, db);
    const dealId = (await getRequest(ctx, { userId: brand.id, requestId })).dealId ?? '';
    const [campaign] = await listCampaigns(ctx, brand.id);
    const otherBrand = await createBrandOwner(ctx, db, 'intruder@other.in');
    await createSearchableCreator(ctx, db, { email: 'other-creator@example.in' });
    const otherCreator = await db.user.findUniqueOrThrow({
      where: { email: 'other-creator@example.in' },
    });

    // Functions, so each attempt starts only when awaited (no unhandled rejections).
    const attempts = [
      ...[otherBrand.id, otherCreator.id].flatMap((userId) => [
        () => getDeal(ctx, { userId, dealId }),
        () => cancelDeal(ctx, { userId, dealId, reason: 'Not my deal at all' }),
      ]),
      () => markDealPaid(ctx, { userId: otherBrand.id, dealId }),
      () =>
        updateDealTerms(ctx, {
          userId: otherBrand.id,
          dealId,
          agreedAmountRupees: 1,
          advancePercent: null,
          paymentDueOn: null,
        }),
      () =>
        addPostLink(ctx, {
          userId: otherCreator.id,
          dealId,
          url: `https://mock.social/${CREATOR_CHANNEL_ID}/reel`,
        }),
      () => getCampaignReport(ctx, { userId: otherBrand.id, campaignId: campaign?.id ?? '' }),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }

    const deal = await db.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect(deal.status).toBe('ACCEPTED');
    expect(await db.dealPost.count()).toBe(0);
    expect(
      await db.auditEvent.count({
        where: { action: 'access.denied', actorUserId: { in: [otherBrand.id, otherCreator.id] } },
      }),
    ).toBe(attempts.length);
    expect((await listDeals(ctx, { userId: otherBrand.id, page: 1 })).items).toEqual([]);
    expect(await listCampaigns(ctx, otherBrand.id)).toEqual([]);
  });

  it('SR-5 creators cannot see campaign reports', async () => {
    const { creatorUser, brand } = await acceptedRequest(ctx, db);
    const [campaign] = await listCampaigns(ctx, brand.id);

    await expect(
      getCampaignReport(ctx, { userId: creatorUser.id, campaignId: campaign?.id ?? '' }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });
});
