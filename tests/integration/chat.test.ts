import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { countUnreadMessages, getChat, listChats, sendMessage } from '@/services/chat';
import { reportChatPartner } from '@/services/reports';
import { getRequest, setBlocked } from '@/services/requests';
import { acceptedRequest } from './collaboration-fixtures';
import { createBrandOwner } from './discovery-fixtures';
import { createTestDatabaseClient } from './test-database';
import { createTestContext, resetDatabase, type TestContext } from './test-context';

const HOUR_MS = 3_600_000;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

/** An accepted request and its chat id. */
async function openChat() {
  const parties = await acceptedRequest(ctx, db);
  const view = await getRequest(ctx, { userId: parties.brand.id, requestId: parties.requestId });
  if (!view.chatId) throw new Error('accepting should open a chat');
  return { ...parties, threadId: view.chatId };
}

const say = (userId: string, threadId: string, body: string) =>
  sendMessage(ctx, { userId, threadId, body, attachment: null });

describe('chat (FR-8, UC-R3)', () => {
  it('UC-R3 accepting a request opens a chat both sides can write in', async () => {
    const { brand, creatorUser, threadId } = await openChat();

    await say(brand.id, threadId, 'Hello Asha, thanks for accepting!');
    ctx.clock.advance(60_000);
    await say(creatorUser.id, threadId, 'Happy to work with you.');

    const chat = await getChat(ctx, { userId: brand.id, threadId });
    expect(chat.otherPartyName).toBe('Asha Cooks');
    expect(chat.messages.map((message) => [message.body, message.isMine])).toEqual([
      ['Hello Asha, thanks for accepting!', true],
      ['Happy to work with you.', false],
    ]);
    expect(chat.closedReason).toBeNull();
  });

  it('FR-8.3 shows unread counts until the chat is opened, then "Seen" to the sender', async () => {
    const { brand, creatorUser, threadId } = await openChat();
    await say(brand.id, threadId, 'First');
    ctx.clock.advance(1_000);
    await say(brand.id, threadId, 'Second');

    expect(await countUnreadMessages(ctx, creatorUser.id)).toBe(2);
    expect((await listChats(ctx, { userId: creatorUser.id, page: 1 })).items[0]?.unreadCount).toBe(
      2,
    );
    let brandView = await getChat(ctx, { userId: brand.id, threadId });
    expect(brandView.messages.every((message) => !message.isSeen)).toBe(true);

    ctx.clock.advance(1_000);
    await getChat(ctx, { userId: creatorUser.id, threadId });

    expect(await countUnreadMessages(ctx, creatorUser.id)).toBe(0);
    brandView = await getChat(ctx, { userId: brand.id, threadId });
    expect(brandView.messages.every((message) => message.isSeen)).toBe(true);
  });

  it("FR-8.1 the brand's team shares the chat and its read position", async () => {
    const { brand, creatorUser, threadId } = await openChat();
    const colleague = await createBrandOwner(ctx, db, 'colleague@spiceco.in');
    const ownerBrand = await db.brandMember.findUniqueOrThrow({ where: { userId: brand.id } });
    await db.brandMember.update({
      where: { userId: colleague.id },
      data: { brandId: ownerBrand.brandId, role: 'MEMBER' },
    });
    await say(creatorUser.id, threadId, 'Here is my draft.');

    expect(await countUnreadMessages(ctx, colleague.id)).toBe(1);
    await getChat(ctx, { userId: colleague.id, threadId });

    expect(await countUnreadMessages(ctx, brand.id)).toBe(0);
  });

  it('FR-8.2 flags contact details in early messages only', async () => {
    const { brand, creatorUser, threadId } = await openChat();
    await say(creatorUser.id, threadId, 'WhatsApp me on 98765 43210');
    for (let index = 0; index < 10; index += 1) await say(brand.id, threadId, `Update ${index}`);
    ctx.clock.advance(49 * HOUR_MS);
    await say(creatorUser.id, threadId, 'My portfolio: www.example.com/asha');

    const { messages } = await getChat(ctx, { userId: brand.id, threadId });
    expect(messages[0]?.contactFlags).toEqual(['PHONE']);
    expect(messages.at(-1)?.contactFlags).toEqual([]);
  });

  it('UC-R3 sends an image, stored privately under a random key', async () => {
    const { brand, threadId } = await openChat();

    await sendMessage(ctx, {
      userId: brand.id,
      threadId,
      body: '',
      attachment: { bytes: PNG, fileName: '../moodboard.png' },
    });

    const [message] = (await getChat(ctx, { userId: brand.id, threadId })).messages;
    expect(message?.attachment).toMatchObject({
      fileName: 'moodboard.png',
      contentType: 'image/png',
      sizeBytes: PNG.length,
    });
    expect(message?.attachment?.storageKey).toMatch(/^attachments\/[A-Za-z0-9_-]{32}$/);
    expect(await ctx.fileStorage.get(message?.attachment?.storageKey ?? '')).not.toBeNull();
  });

  it('UC-R3 rejects oversized, unknown and infected files', async () => {
    const { brand, threadId } = await openChat();
    const send = (bytes: Buffer) =>
      sendMessage(ctx, {
        userId: brand.id,
        threadId,
        body: 'x',
        attachment: { bytes, fileName: 'f' },
      });

    await expect(send(Buffer.alloc(10 * 1024 * 1024 + 1, 0x25))).rejects.toMatchObject({
      fieldErrors: { attachment: 'chat.fileTooLarge' },
    });
    await expect(send(Buffer.from('MZ executable'))).rejects.toMatchObject({
      fieldErrors: { attachment: 'chat.fileType' },
    });
    const infected = { ...ctx, malwareScanner: { scan: async () => 'INFECTED' as const } };
    await expect(
      sendMessage(infected, {
        userId: brand.id,
        threadId,
        body: '',
        attachment: { bytes: PNG, fileName: 'a.png' },
      }),
    ).rejects.toMatchObject({ fieldErrors: { attachment: 'chat.fileRejected' } });
    expect(await db.message.count()).toBe(0);
  });

  it('UC-R3 nobody can write once either side has blocked the other', async () => {
    const { brand, creatorUser, requestId, threadId } = await openChat();
    await setBlocked(ctx, { userId: creatorUser.id, requestId, isBlocked: true });

    await expect(say(brand.id, threadId, 'Hello?')).rejects.toMatchObject({
      code: 'NOT_AVAILABLE',
    });
    await expect(say(creatorUser.id, threadId, 'Bye')).rejects.toMatchObject({
      code: 'NOT_AVAILABLE',
    });
    expect((await getChat(ctx, { userId: brand.id, threadId })).closedReason).toBe('BLOCKED');
  });

  it('UC-R3 a deleted sender is shown as "Deleted user" and the chat closes', async () => {
    const { brand, creatorUser, threadId } = await openChat();
    await say(creatorUser.id, threadId, 'See you');
    // Account deletion (phase g) removes the sender link and deactivates the account.
    await db.message.updateMany({
      where: { senderUserId: creatorUser.id },
      data: { senderUserId: null },
    });
    await db.user.update({ where: { id: creatorUser.id }, data: { status: 'SUSPENDED' } });

    const chat = await getChat(ctx, { userId: brand.id, threadId });

    expect(chat.messages[0]?.senderName).toBeNull();
    expect(chat.closedReason).toBe('UNAVAILABLE');
  });

  it('pages back through long chats', async () => {
    const { brand, threadId } = await openChat();
    for (let index = 1; index <= 55; index += 1) {
      ctx.clock.advance(1_000);
      await say(brand.id, threadId, `Message ${index}`);
    }

    const newest = await getChat(ctx, { userId: brand.id, threadId });
    const older = await getChat(ctx, {
      userId: brand.id,
      threadId,
      beforeMessageId: newest.messages[0]?.id,
    });

    expect(newest.messages).toHaveLength(50);
    expect(newest.messages[0]?.body).toBe('Message 6');
    expect(newest.hasOlder).toBe(true);
    expect(older.messages.map((message) => message.body)).toEqual([
      'Message 1',
      'Message 2',
      'Message 3',
      'Message 4',
      'Message 5',
    ]);
    expect(older.hasOlder).toBe(false);
  });

  it('SEC-6 limits how fast one user can send messages', async () => {
    const { brand, threadId } = await openChat();
    for (let index = 0; index < 60; index += 1) await say(brand.id, threadId, `Spam ${index}`);

    await expect(say(brand.id, threadId, 'One more')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });
});

describe('reports (FR-8.3)', () => {
  it('FR-8.3 reports the other side to the moderation queue once', async () => {
    const { brand, creator, threadId } = await openChat();

    await reportChatPartner(ctx, {
      userId: brand.id,
      threadId,
      reason: 'Asked me to pay a fee first',
    });
    await reportChatPartner(ctx, { userId: brand.id, threadId, reason: 'Again, the same thing' });

    const reports = await db.report.findMany();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      reporterUserId: brand.id,
      targetType: 'CREATOR',
      targetId: creator.creatorId,
      threadId,
      status: 'OPEN',
    });
  });
});
