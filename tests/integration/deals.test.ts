import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { SocialPlatformProvider } from '@/adapters/social/provider';
import { SocialProviderError } from '@/adapters/social/provider';
import { getCampaignReport, listCampaigns } from '@/services/campaigns';
import {
  addPostLink,
  cancelDeal,
  confirmPaymentReceived,
  getDeal,
  listDeals,
  markDealPaid,
  refreshDealPosts,
  reportPaymentNotReceived,
  sendDealReminders,
  submitContent,
  updateDealTerms,
} from '@/services/deals';
import { getRequest } from '@/services/requests';
import { acceptedRequest, CREATOR_CHANNEL_ID, type PartyOptions } from './collaboration-fixtures';
import { createTestDatabaseClient } from './test-database';
import { createTestContext, resetDatabase, type TestContext } from './test-context';

const DAY_MS = 86_400_000;
const POST_URL = `https://mock.social/${CREATOR_CHANNEL_ID}/diwali-reel`;
const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

/** An accepted request and its deal. */
async function openDeal(options: PartyOptions = {}) {
  const parties = await acceptedRequest(ctx, db, options);
  const view = await getRequest(ctx, { userId: parties.brand.id, requestId: parties.requestId });
  if (!view.dealId) throw new Error('accepting should start a deal');
  return { ...parties, dealId: view.dealId };
}

describe('deals (FR-9.1, FR-9.2, UC-R4, UC-R5)', () => {
  it('UC-R2 accepting starts a deal with the budget as the agreed amount', async () => {
    const { brand, creatorUser, dealId } = await openDeal();

    const deal = await getDeal(ctx, { userId: creatorUser.id, dealId });

    expect(deal).toMatchObject({
      status: 'ACCEPTED',
      agreedAmountMinor: 2_500_000,
      viewerSide: 'CREATOR',
      otherPartyName: 'Test Brand Pvt Ltd',
      allowedActions: ['SUBMIT_CONTENT', 'ADD_POST', 'CANCEL'],
    });
    expect(deal.chatId).not.toBeNull();
    expect((await listDeals(ctx, { userId: brand.id, page: 1 })).items).toHaveLength(1);
  });

  it('UC-R4 runs from acceptance to completion in order', async () => {
    const { brand, creatorUser, dealId } = await openDeal();

    await updateDealTerms(ctx, {
      userId: brand.id,
      dealId,
      agreedAmountRupees: 30_000,
      advancePercent: 50,
      paymentDueOn: '2026-11-30',
    });
    await submitContent(ctx, { userId: creatorUser.id, dealId, note: 'Draft shared in chat' });
    await addPostLink(ctx, { userId: creatorUser.id, dealId, url: POST_URL });
    await markDealPaid(ctx, { userId: brand.id, dealId });
    await confirmPaymentReceived(ctx, { userId: creatorUser.id, dealId });

    const deal = await getDeal(ctx, { userId: brand.id, dealId });
    expect(deal).toMatchObject({
      status: 'COMPLETED',
      agreedAmountMinor: 3_000_000,
      payment: { advanceMinor: 1_500_000, balanceMinor: 1_500_000 },
    });
    expect(deal.posts).toEqual([
      expect.objectContaining({ platform: 'YOUTUBE', url: POST_URL, status: 'LIVE' }),
    ]);
    expect(deal.events.map((event) => event.kind)).toEqual([
      'CREATED',
      'TERMS_UPDATED',
      'CONTENT_SUBMITTED',
      'POST_ADDED',
      'PAYMENT_MARKED',
      'PAYMENT_CONFIRMED',
    ]);
    const paidEmail = await db.emailOutbox.findFirstOrThrow({
      where: { template: 'paymentMarked' },
    });
    expect(paidEmail.toAddress).toBe('creator@example.in');
  });

  it('UC-R4 rejects out-of-order updates and the other side’s steps', async () => {
    const { brand, creatorUser, dealId } = await openDeal();

    await expect(markDealPaid(ctx, { userId: brand.id, dealId })).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(markDealPaid(ctx, { userId: creatorUser.id, dealId })).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
    await expect(submitContent(ctx, { userId: brand.id, dealId, note: '' })).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
    expect((await getDeal(ctx, { userId: brand.id, dealId })).status).toBe('ACCEPTED');
  });

  it('UC-R4 either side can cancel with a reason, and the other side is told', async () => {
    const { brand, creatorUser, dealId } = await openDeal();

    await cancelDeal(ctx, { userId: creatorUser.id, dealId, reason: 'Family emergency, sorry' });

    expect(await getDeal(ctx, { userId: brand.id, dealId })).toMatchObject({
      status: 'CANCELLED',
      cancelledBySide: 'CREATOR',
      cancelReason: 'Family emergency, sorry',
      allowedActions: [],
    });
    const email = await db.emailOutbox.findFirstOrThrow({ where: { template: 'dealCancelled' } });
    expect(email.toAddress).toBe('owner@spiceco.in');
  });

  it('UC-R4 a deal cannot be cancelled once payment is marked', async () => {
    const { brand, creatorUser, dealId } = await openDeal();
    await addPostLink(ctx, { userId: creatorUser.id, dealId, url: POST_URL });
    await markDealPaid(ctx, { userId: brand.id, dealId });

    await expect(
      cancelDeal(ctx, { userId: brand.id, dealId, reason: 'Changed our minds' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('UC-R5 "not received" goes to the admins as a report and the deal waits', async () => {
    const { brand, creatorUser, dealId } = await openDeal();
    await addPostLink(ctx, { userId: creatorUser.id, dealId, url: POST_URL });
    await markDealPaid(ctx, { userId: brand.id, dealId });

    await reportPaymentNotReceived(ctx, {
      userId: creatorUser.id,
      dealId,
      note: 'Nothing in my account after a week',
    });

    expect((await getDeal(ctx, { userId: brand.id, dealId })).status).toBe('PAYMENT_MARKED');
    const report = await db.report.findFirstOrThrow();
    expect(report).toMatchObject({
      targetType: 'PAYMENT',
      targetId: dealId,
      reporterUserId: creatorUser.id,
      status: 'OPEN',
    });
    expect(report.threadId).not.toBeNull();
  });

  it('FR-9.2 rejects a payment due date in the past', async () => {
    const { brand, dealId } = await openDeal();

    await expect(
      updateDealTerms(ctx, {
        userId: brand.id,
        dealId,
        agreedAmountRupees: 10_000,
        advancePercent: null,
        paymentDueOn: '2026-10-01',
      }),
    ).rejects.toMatchObject({ fieldErrors: { paymentDueOn: 'deal.invalidDueDate' } });
  });
});

describe('reminders (UC-R4, UC-R5)', () => {
  it('UC-R4 reminds both sides once when the deadline passes with nothing posted', async () => {
    await openDeal();
    ctx.clock.advance(40 * DAY_MS); // deadline 2026-11-15, now 2026-11-18

    expect(await sendDealReminders(ctx)).toEqual({ deadlineReminders: 1, paymentReminders: 0 });
    expect(await sendDealReminders(ctx)).toEqual({ deadlineReminders: 0, paymentReminders: 0 });

    const emails = await db.emailOutbox.findMany({ where: { template: 'dealDeadlinePassed' } });
    expect(emails.map((email) => email.toAddress).sort()).toEqual([
      'creator@example.in',
      'owner@spiceco.in',
    ]);
  });

  it('UC-R5 reminds the brand of an overdue payment after 7 days, then weekly', async () => {
    const { creatorUser, dealId } = await openDeal();
    await addPostLink(ctx, { userId: creatorUser.id, dealId, url: POST_URL });

    ctx.clock.advance(6 * DAY_MS);
    expect((await sendDealReminders(ctx)).paymentReminders).toBe(0);
    ctx.clock.advance(1 * DAY_MS);
    expect((await sendDealReminders(ctx)).paymentReminders).toBe(1);
    ctx.clock.advance(3 * DAY_MS);
    expect((await sendDealReminders(ctx)).paymentReminders).toBe(0);
    ctx.clock.advance(4 * DAY_MS);
    expect((await sendDealReminders(ctx)).paymentReminders).toBe(1);

    const emails = await db.emailOutbox.findMany({ where: { template: 'paymentOverdue' } });
    expect(emails.map((email) => email.toAddress)).toEqual([
      'owner@spiceco.in',
      'owner@spiceco.in',
    ]);
  });
});

describe('posts and campaign reports (FR-9.3, UC-R6)', () => {
  it("UC-R6 rejects a link to someone else's post, a private post and other sites", async () => {
    const { creatorUser, dealId } = await openDeal();
    const tryLink = (url: string) => addPostLink(ctx, { userId: creatorUser.id, dealId, url });

    await expect(tryLink('https://mock.social/mock-yt-someone-else/reel')).rejects.toMatchObject({
      fieldErrors: { url: 'deal.notYourPost' },
    });
    await expect(
      tryLink(`https://mock.social/${CREATOR_CHANNEL_ID}/private-reel`),
    ).rejects.toMatchObject({ fieldErrors: { url: 'deal.postPrivate' } });
    await expect(tryLink('https://example.com/post/1')).rejects.toMatchObject({
      fieldErrors: { url: 'deal.unknownLink' },
    });
    await tryLink(POST_URL);
    await expect(tryLink(POST_URL)).rejects.toMatchObject({
      fieldErrors: { url: 'deal.alreadyAdded' },
    });
  });

  it('UC-R6 a post deleted later keeps its last stats and is marked deleted', async () => {
    const { brand, creatorUser, dealId } = await openDeal();
    await addPostLink(ctx, { userId: creatorUser.id, dealId, url: POST_URL });
    const before = (await getDeal(ctx, { userId: brand.id, dealId })).posts[0];
    const deletedEverywhere: SocialPlatformProvider = {
      ...ctx.socialProviders.YOUTUBE,
      fetchPostStats: async () => null,
    };
    const later = {
      ...ctx,
      socialProviders: { ...ctx.socialProviders, YOUTUBE: deletedEverywhere },
    };
    ctx.clock.advance(DAY_MS);

    expect(await refreshDealPosts(later)).toMatchObject({ deleted: 1 });

    const after = (await getDeal(ctx, { userId: brand.id, dealId })).posts[0];
    expect(after).toMatchObject({ status: 'DELETED', views: before?.views, likes: before?.likes });
  });

  it('UC-R6 a post made private later is marked private', async () => {
    const { brand, creatorUser, dealId } = await openDeal();
    await addPostLink(ctx, { userId: creatorUser.id, dealId, url: POST_URL });
    const nowPrivate: SocialPlatformProvider = {
      ...ctx.socialProviders.YOUTUBE,
      fetchPostStats: async () => {
        throw new SocialProviderError('ACCOUNT_PRIVATE');
      },
    };
    ctx.clock.advance(DAY_MS);

    await refreshDealPosts({
      ...ctx,
      socialProviders: { ...ctx.socialProviders, YOUTUBE: nowPrivate },
    });

    expect((await getDeal(ctx, { userId: brand.id, dealId })).posts[0]?.status).toBe('PRIVATE');
  });

  it('FR-9.3 reports campaign totals and cost per view', async () => {
    const { brand, creatorUser, dealId } = await openDeal();
    await addPostLink(ctx, { userId: creatorUser.id, dealId, url: POST_URL });
    const [campaign] = await listCampaigns(ctx, brand.id);

    const report = await getCampaignReport(ctx, {
      userId: brand.id,
      campaignId: campaign?.id ?? '',
    });

    const post = report.deals[0]?.posts[0];
    expect(campaign).toMatchObject({ name: 'Diwali 2026', requestCount: 1, dealCount: 1 });
    expect(report.totals).toMatchObject({
      dealCount: 1,
      postCount: 1,
      views: post?.views,
      spendMinor: 2_500_000,
    });
    expect(report.totals?.costPerThousandViewsMinor).toBe(
      Math.round((2_500_000 / (post?.views ?? 1)) * 1000),
    );
  });

  it('FR-11.1 campaign totals need a plan with campaign reports', async () => {
    const { brand } = await openDeal({ brandPlan: 'TRIAL' });
    const [campaign] = await listCampaigns(ctx, brand.id);

    const report = await getCampaignReport(ctx, {
      userId: brand.id,
      campaignId: campaign?.id ?? '',
    });

    expect(report.totals).toBeNull();
    expect(report.deals).toHaveLength(1);
  });
});
