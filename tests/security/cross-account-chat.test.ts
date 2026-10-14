import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getChat, listChats, sendMessage } from '@/services/chat';
import { reportChatPartner } from '@/services/reports';
import { getRequest } from '@/services/requests';
import { acceptedRequest } from '../integration/collaboration-fixtures';
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

describe('chats across accounts (SR-5, SEC-2)', () => {
  it('SEC-2 another brand or creator gets "not found" for a chat, and it is logged', async () => {
    const { brand, requestId } = await acceptedRequest(ctx, db);
    const threadId = (await getRequest(ctx, { userId: brand.id, requestId })).chatId ?? '';
    await sendMessage(ctx, { userId: brand.id, threadId, body: 'Private terms', attachment: null });
    const otherBrand = await createBrandOwner(ctx, db, 'intruder@other.in');
    await createSearchableCreator(ctx, db, { email: 'other-creator@example.in' });
    const otherCreator = await db.user.findUniqueOrThrow({
      where: { email: 'other-creator@example.in' },
    });

    // Functions, so each attempt starts only when awaited (no unhandled rejections).
    const attempts = [otherBrand.id, otherCreator.id].flatMap((userId) => [
      () => getChat(ctx, { userId, threadId }),
      () => sendMessage(ctx, { userId, threadId, body: 'hi', attachment: null }),
      () => reportChatPartner(ctx, { userId, threadId, reason: 'Trying to report someone' }),
    ]);
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }

    expect(await db.message.count()).toBe(1);
    expect(await db.report.count()).toBe(0);
    expect(
      await db.auditEvent.count({
        where: { action: 'access.denied', actorUserId: { in: [otherBrand.id, otherCreator.id] } },
      }),
    ).toBe(attempts.length);
    expect((await listChats(ctx, { userId: otherBrand.id, page: 1 })).items).toEqual([]);
  });
});
