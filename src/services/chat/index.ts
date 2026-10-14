/** Chat module: one chat per accepted request, with attachments and safety flags (FR-8, UC-R3). */
import { randomBytes } from 'node:crypto';
import type { MessageRecord, ThreadRecord, ThreadSummary } from '@/adapters/db/chat-repository';
import type { Repositories } from '@/adapters/db/repositories';
import { CHAT_ATTACHMENT, CHAT_LIMITS, COLLABORATION_PAGE_SIZE } from '@/config/collaboration';
import { type CollabSide, contactFlagsFor, isEarlyMessage, safeFileName } from '@/domain/chat';
import { notAvailable, notFound, validationFailed } from '@/domain/errors';
import { detectAttachmentType } from '@/domain/file-types';
import { getLogger } from '@/lib/logger';
import type { ServiceContext } from '../context';
import { requestEmailDispatch } from '../email';
import { brandContactIds, notifyUsers } from '../notifications';
import { consumeRateLimit, recordSecurityEvent } from '../security';

export type { MessageRecord, ThreadSummary } from '@/adapters/db/chat-repository';

const logger = getLogger('chat');

/** Opens the chat for an accepted request; call inside the acceptance transaction. */
export async function openChatThread(
  repos: Repositories,
  request: { readonly id: string; readonly brandId: string; readonly creatorId: string },
  now: Date,
): Promise<string> {
  return repos.chat.createThread({
    requestId: request.id,
    brandId: request.brandId,
    creatorId: request.creatorId,
    createdAt: now,
  });
}

/**
 * The chat and the side the user is on: the creator, or any member of the brand's team.
 * Anyone else gets "not found", and the attempt is logged (SR-5, SEC-2).
 */
export async function requireThreadAccess(
  repos: Repositories,
  userId: string,
  threadId: string,
): Promise<{ thread: ThreadRecord; side: CollabSide }> {
  const thread = await repos.chat.findThread(threadId);
  if (thread?.creatorUserId === userId) return { thread, side: 'CREATOR' };
  if (thread) {
    const membership = await repos.brands.findMembership(userId);
    if (membership?.brandId === thread.brandId) return { thread, side: 'BRAND' };
  }
  await recordSecurityEvent(repos, {
    action: 'access.denied',
    actorUserId: userId,
    metadata: { resource: 'chat' },
  });
  throw notFound();
}

export type ChatClosedReason = 'BLOCKED' | 'UNAVAILABLE';

/** Why nobody can write in this chat now, or null when both sides can. */
async function closedReason(
  repos: Repositories,
  thread: ThreadRecord,
): Promise<ChatClosedReason | null> {
  if (await repos.requests.isBlockedEitherWay(thread.creatorId, thread.brandId)) return 'BLOCKED';
  const creatorUser = await repos.users.findById(thread.creatorUserId);
  const brandMembers = await repos.brands.activeMemberIds(thread.brandId);
  if (creatorUser?.status !== 'ACTIVE' || brandMembers.length === 0) return 'UNAVAILABLE';
  return null;
}

export interface ChatView {
  readonly id: string;
  readonly requestId: string;
  readonly campaignName: string;
  readonly viewerSide: CollabSide;
  /** The other party: the brand's name, or the creator's display name. */
  readonly otherPartyName: string;
  readonly creatorSlug: string;
  readonly messages: readonly (MessageRecord & {
    readonly isMine: boolean;
    /** For the viewer's own messages: whether the other side has seen it (FR-8.3). */
    readonly isSeen: boolean;
  })[];
  readonly hasOlder: boolean;
  readonly closedReason: ChatClosedReason | null;
  readonly isBlockedByViewer: boolean;
}

/**
 * FR-8.1 / FR-8.3: a page of the chat, oldest first. Opening the newest page marks the
 * chat read for the viewer's side, which is what the other side sees as "Seen".
 */
export async function getChat(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly threadId: string; readonly beforeMessageId?: string },
): Promise<ChatView> {
  const { thread, side } = await requireThreadAccess(ctx.repos, input.userId, input.threadId);
  const before =
    input.beforeMessageId &&
    (await ctx.repos.chat.isMessageInThread(thread.id, input.beforeMessageId))
      ? input.beforeMessageId
      : undefined;
  const page = await ctx.repos.chat.listMessages(thread.id, {
    beforeMessageId: before,
    limit: CHAT_LIMITS.pageSize,
  });
  if (!before) await ctx.repos.chat.markRead(thread.id, side, ctx.clock.now());

  const otherReadAt = side === 'BRAND' ? thread.creatorLastReadAt : thread.brandLastReadAt;
  return {
    id: thread.id,
    requestId: thread.requestId,
    campaignName: thread.campaignName,
    viewerSide: side,
    otherPartyName: side === 'BRAND' ? thread.creatorDisplayName : thread.brandName,
    creatorSlug: thread.creatorSlug,
    messages: page.messages.map((message) => ({
      ...message,
      isMine: message.senderSide === side,
      isSeen: otherReadAt !== null && message.createdAt <= otherReadAt,
    })),
    hasOlder: page.hasOlder,
    closedReason: await closedReason(ctx.repos, thread),
    isBlockedByViewer: await ctx.repos.requests.hasBlocked(thread.creatorId, thread.brandId, side),
  };
}

/** Checks an uploaded file and stores it; returns what the message records (SR-9, SEC-8). */
async function storeAttachment(
  ctx: ServiceContext,
  file: { readonly bytes: Buffer; readonly fileName: string },
): Promise<NonNullable<Parameters<Repositories['chat']['addMessage']>[0]['attachment']>> {
  if (file.bytes.length === 0 || file.bytes.length > CHAT_ATTACHMENT.maxBytes) {
    throw validationFailed({ attachment: 'chat.fileTooLarge' });
  }
  const contentType = detectAttachmentType(file.bytes);
  if (!contentType) throw validationFailed({ attachment: 'chat.fileType' });
  if ((await ctx.malwareScanner.scan(file.bytes)) !== 'CLEAN') {
    logger.warn({ action: 'attachment.rejected' }, 'infected attachment rejected');
    throw validationFailed({ attachment: 'chat.fileRejected' });
  }
  const storageKey = `attachments/${randomBytes(24).toString('base64url')}`;
  await ctx.fileStorage.put(storageKey, { bytes: file.bytes, contentType });
  return {
    storageKey,
    fileName: safeFileName(file.fileName, CHAT_ATTACHMENT.fileNameMax),
    contentType,
    sizeBytes: file.bytes.length,
  };
}

/**
 * FR-8.1 / FR-8.2 / UC-R3: sends a message with an optional image or PDF. Phone numbers,
 * emails and links in early messages are flagged so both sides see a safety note.
 * Blocked chats and chats with a side that is gone can't be written to. Rate-limited
 * (SEC-6).
 */
export async function sendMessage(
  ctx: ServiceContext,
  input: {
    readonly userId: string;
    readonly threadId: string;
    readonly body: string;
    readonly attachment: { readonly bytes: Buffer; readonly fileName: string } | null;
  },
): Promise<void> {
  const now = ctx.clock.now();
  await consumeRateLimit(ctx.repos, now, 'messagesPerUser', input.userId);
  const { thread, side } = await requireThreadAccess(ctx.repos, input.userId, input.threadId);
  if (await closedReason(ctx.repos, thread)) throw notAvailable();
  const body = input.body.trim();
  if (body.length === 0 && !input.attachment)
    throw validationFailed({ body: 'validation.required' });
  if (body.length > CHAT_LIMITS.messageMax) throw validationFailed({ body: 'validation.tooLong' });

  const attachment = input.attachment ? await storeAttachment(ctx, input.attachment) : null;
  const isEarly = isEarlyMessage(
    { messageCount: await ctx.repos.chat.countMessages(thread.id), startedAt: thread.createdAt },
    now,
    CHAT_LIMITS,
  );
  // FR-12.1: tell the other side once per batch, not for every message.
  const otherSideReadAt = side === 'BRAND' ? thread.creatorLastReadAt : thread.brandLastReadAt;
  const hasUnreadAlready =
    (await ctx.repos.chat.countFromSideSince(thread.id, side, otherSideReadAt)) > 0;
  try {
    await ctx.transaction(async (repos) => {
      await repos.chat.addMessage({
        threadId: thread.id,
        senderUserId: input.userId,
        senderSide: side,
        body,
        contactFlags: contactFlagsFor(body, isEarly),
        createdAt: now,
        attachment,
      });
      if (!hasUnreadAlready) await notifyNewMessage(repos, ctx.appUrl, thread, side, now);
    });
  } catch (error) {
    // Don't leave an unreferenced file behind.
    if (attachment) await ctx.fileStorage.delete(attachment.storageKey);
    throw error;
  }
  if (!hasUnreadAlready) await requestEmailDispatch(ctx.jobQueue);
}

/** FR-12.1: the other side of the chat hears there is a new message (never its content). */
async function notifyNewMessage(
  repos: Repositories,
  appUrl: string,
  thread: ThreadRecord,
  senderSide: CollabSide,
  now: Date,
): Promise<void> {
  const request = await repos.requests.findById(thread.requestId);
  const userIds =
    senderSide === 'BRAND'
      ? [thread.creatorUserId]
      : await brandContactIds(repos, thread.brandId, request?.sentByUserId ?? null);
  await notifyUsers(repos, appUrl, {
    now,
    userIds,
    path: `/messages/${thread.id}`,
    email: (recipient) => ({
      template: 'newMessage',
      payload: {
        ...recipient,
        senderName: senderSide === 'BRAND' ? thread.brandName : thread.creatorDisplayName,
        campaignName: thread.campaignName,
      },
    }),
  });
}

export interface ChatListPage {
  readonly items: readonly (ThreadSummary & {
    readonly otherPartyName: string;
    readonly unreadCount: number;
  })[];
  readonly page: number;
  readonly pageCount: number;
}

/** The user's side of the conversation: their brand's chats, or the creator's own. */
async function chatOwnerFor(
  repos: Repositories,
  userId: string,
): Promise<{ owner: { brandId: string } | { creatorId: string }; side: CollabSide } | null> {
  const membership = await repos.brands.findMembership(userId);
  if (membership) return { owner: { brandId: membership.brandId }, side: 'BRAND' };
  const creator = await repos.creators.findByUserId(userId);
  if (creator) return { owner: { creatorId: creator.id }, side: 'CREATOR' };
  return null;
}

/** FR-8.3: the user's chats, most recent activity first, with unread counts. */
export async function listChats(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly page: number },
): Promise<ChatListPage> {
  const page = Math.max(1, Math.floor(input.page));
  const owner = await chatOwnerFor(ctx.repos, input.userId);
  if (!owner) return { items: [], page, pageCount: 1 };
  const result = await ctx.repos.chat.listThreads(owner.owner, {
    offset: (page - 1) * COLLABORATION_PAGE_SIZE,
    limit: COLLABORATION_PAGE_SIZE,
  });
  const unread = await ctx.repos.chat.unreadCounts(result.items, owner.side);
  return {
    items: result.items.map((thread) => ({
      ...thread,
      otherPartyName: owner.side === 'BRAND' ? thread.creatorDisplayName : thread.brandName,
      unreadCount: unread.get(thread.id) ?? 0,
    })),
    page,
    pageCount: Math.max(1, Math.ceil(result.total / COLLABORATION_PAGE_SIZE)),
  };
}

/** FR-8.3: unread messages across all the user's chats (navigation badge). */
export async function countUnreadMessages(ctx: ServiceContext, userId: string): Promise<number> {
  const owner = await chatOwnerFor(ctx.repos, userId);
  return owner ? ctx.repos.chat.countUnread(owner.owner) : 0;
}
