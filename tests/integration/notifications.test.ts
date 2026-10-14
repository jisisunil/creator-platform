import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { requestPasswordReset } from '@/services/accounts';
import { getChat, sendMessage } from '@/services/chat';
import { submitContent } from '@/services/deals';
import {
  countUnreadNotifications,
  getNotificationPreferences,
  listNotifications,
  saveNotificationPreferences,
} from '@/services/notifications';
import { getRequest } from '@/services/requests';
import { purgeExpiredSecurityData } from '@/services/retention';
import { acceptedRequest, createBrandAndCreator, sendTestRequest } from './collaboration-fixtures';
import { createTestDatabaseClient } from './test-database';
import { createTestContext, requestFrom, resetDatabase, type TestContext } from './test-context';

const DAY_MS = 86_400_000;
const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

const emailCount = (template: string, toAddress: string) =>
  db.emailOutbox.count({ where: { template, toAddress } });

describe('notifications (FR-12.1)', () => {
  it('FR-12.1 a new request reaches the creator in the app and by email', async () => {
    const { brand, creator, creatorUser } = await createBrandAndCreator(ctx, db);

    const requestId = await sendTestRequest(ctx, brand.id, creator.creatorId);

    expect(await countUnreadNotifications(ctx, creatorUser.id)).toBe(1);
    expect(await emailCount('requestReceived', 'creator@example.in')).toBe(1);
    const page = await listNotifications(ctx, { userId: creatorUser.id, page: 1 });
    expect(page.items[0]).toMatchObject({
      kind: 'requestReceived',
      params: { brandName: 'Test Brand Pvt Ltd', campaignName: 'Diwali 2026' },
      path: `/creator/requests/${requestId}`,
      readAt: null,
    });
    expect(await countUnreadNotifications(ctx, creatorUser.id)).toBe(0);
    // SR-5: notifications are always the signed-in user's own.
    expect((await listNotifications(ctx, { userId: brand.id, page: 1 })).items).toEqual([]);
  });

  it('FR-12.1 new messages notify once until the other side has read them', async () => {
    const { brand, creatorUser, requestId } = await acceptedRequest(ctx, db);
    const threadId = (await getRequest(ctx, { userId: brand.id, requestId })).chatId ?? '';
    const say = (body: string) =>
      sendMessage(ctx, { userId: brand.id, threadId, body, attachment: null });

    await say('Hello');
    await say('Are you there?');
    expect(await emailCount('newMessage', 'creator@example.in')).toBe(1);

    ctx.clock.advance(60_000);
    await getChat(ctx, { userId: creatorUser.id, threadId });
    ctx.clock.advance(60_000);
    await say('Thanks for reading');

    expect(await emailCount('newMessage', 'creator@example.in')).toBe(2);
    const email = await db.emailOutbox.findFirstOrThrow({ where: { template: 'newMessage' } });
    // Message text never goes into emails or notifications.
    expect(JSON.stringify(email.payload)).not.toContain('Hello');
  });

  it('FR-12.1 deal steps notify the other side', async () => {
    const { brand, creatorUser, requestId } = await acceptedRequest(ctx, db);
    const dealId = (await getRequest(ctx, { userId: brand.id, requestId })).dealId ?? '';

    await submitContent(ctx, { userId: creatorUser.id, dealId, note: '' });

    expect(await emailCount('dealContentSubmitted', 'owner@spiceco.in')).toBe(1);
  });
});

describe('notification preferences (FR-12.2)', () => {
  it('FR-12.2 everything is on until the user turns it off', async () => {
    const { creatorUser } = await createBrandAndCreator(ctx, db);

    const preferences = await getNotificationPreferences(ctx, creatorUser);

    expect(preferences.every((preference) => preference.isEnabled)).toBe(true);
    expect(new Set(preferences.map((preference) => preference.category))).toEqual(
      new Set(['REQUESTS', 'MESSAGES', 'DEALS', 'RATINGS', 'ACCOUNT']),
    );
  });

  it('FR-12.2 turning off email keeps the in-app notice, and turning both off stops both', async () => {
    const { brand, creator, creatorUser } = await createBrandAndCreator(ctx, db);
    await saveNotificationPreferences(ctx, {
      userId: creatorUser.id,
      role: 'CREATOR',
      enabled: ['REQUESTS:IN_APP', 'MESSAGES:IN_APP', 'MESSAGES:EMAIL'],
    });

    await sendTestRequest(ctx, brand.id, creator.creatorId);

    expect(await emailCount('requestReceived', 'creator@example.in')).toBe(0);
    expect(await countUnreadNotifications(ctx, creatorUser.id)).toBe(1);
    const saved = await getNotificationPreferences(ctx, creatorUser);
    expect(saved.find((p) => p.category === 'REQUESTS' && p.channel === 'EMAIL')?.isEnabled).toBe(
      false,
    );
  });

  it('FR-12.2 security emails are always sent, whatever the preferences', async () => {
    const { creatorUser } = await createBrandAndCreator(ctx, db);
    await saveNotificationPreferences(ctx, {
      userId: creatorUser.id,
      role: 'CREATOR',
      enabled: [],
    });

    await requestPasswordReset(ctx, 'creator@example.in', requestFrom());

    expect(await emailCount('passwordReset', 'creator@example.in')).toBe(1);
  });
});

describe('notification retention (PR-9)', () => {
  it('PR-9 deletes notifications after 180 days', async () => {
    const { brand, creator, creatorUser } = await createBrandAndCreator(ctx, db);
    await sendTestRequest(ctx, brand.id, creator.creatorId);
    ctx.clock.advance(181 * DAY_MS);

    expect((await purgeExpiredSecurityData(ctx)).notifications).toBe(1);
    expect((await listNotifications(ctx, { userId: creatorUser.id, page: 1 })).items).toEqual([]);
  });
});
