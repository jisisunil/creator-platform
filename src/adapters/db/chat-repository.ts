import type { CollabSide } from '@/domain/chat';
import type { ContactDetailKind } from '@/domain/content-safety';
import type { DbClient } from './db-client';

export interface ThreadRecord {
  readonly id: string;
  readonly requestId: string;
  readonly brandId: string;
  readonly brandName: string;
  readonly creatorId: string;
  readonly creatorUserId: string;
  readonly creatorDisplayName: string;
  readonly creatorSlug: string;
  readonly campaignName: string;
  readonly createdAt: Date;
  readonly brandLastReadAt: Date | null;
  readonly creatorLastReadAt: Date | null;
}

export interface ThreadSummary {
  readonly id: string;
  readonly brandName: string;
  readonly creatorDisplayName: string;
  readonly campaignName: string;
  readonly lastMessageAt: Date | null;
  readonly createdAt: Date;
  readonly brandLastReadAt: Date | null;
  readonly creatorLastReadAt: Date | null;
}

export interface MessageRecord {
  readonly id: string;
  readonly senderSide: CollabSide;
  /** Null when the sender's account was deleted. */
  readonly senderName: string | null;
  readonly body: string;
  readonly contactFlags: readonly ContactDetailKind[];
  readonly createdAt: Date;
  readonly attachment: {
    readonly storageKey: string;
    readonly fileName: string;
    readonly contentType: string;
    readonly sizeBytes: number;
  } | null;
}

export interface NewMessage {
  readonly threadId: string;
  readonly senderUserId: string;
  readonly senderSide: CollabSide;
  readonly body: string;
  readonly contactFlags: readonly ContactDetailKind[];
  readonly createdAt: Date;
  readonly attachment: {
    readonly storageKey: string;
    readonly fileName: string;
    readonly contentType: string;
    readonly sizeBytes: number;
  } | null;
}

const THREAD_SUMMARY_SELECT = {
  id: true,
  lastMessageAt: true,
  createdAt: true,
  brandLastReadAt: true,
  creatorLastReadAt: true,
  brand: { select: { name: true } },
  creator: { select: { displayName: true } },
  request: { select: { campaign: { select: { name: true } } } },
} as const;

type ThreadSummaryRow = {
  id: string;
  lastMessageAt: Date | null;
  createdAt: Date;
  brandLastReadAt: Date | null;
  creatorLastReadAt: Date | null;
  brand: { name: string };
  creator: { displayName: string };
  request: { campaign: { name: string } };
};

function toSummary(row: ThreadSummaryRow): ThreadSummary {
  return {
    id: row.id,
    brandName: row.brand.name,
    creatorDisplayName: row.creator.displayName,
    campaignName: row.request.campaign.name,
    lastMessageAt: row.lastMessageAt,
    createdAt: row.createdAt,
    brandLastReadAt: row.brandLastReadAt,
    creatorLastReadAt: row.creatorLastReadAt,
  };
}

const lastReadField = (side: CollabSide) =>
  side === 'BRAND' ? 'brandLastReadAt' : 'creatorLastReadAt';

export type ChatRepository = ReturnType<typeof createChatRepository>;

/** Chat threads, messages and attachments (FR-8, UC-R3). */
export function createChatRepository(db: DbClient) {
  return {
    /** Creates the request's chat; does nothing if it already exists. */
    async createThread(data: {
      requestId: string;
      brandId: string;
      creatorId: string;
      createdAt: Date;
    }): Promise<string> {
      const thread = await db.chatThread.upsert({
        where: { requestId: data.requestId },
        create: data,
        update: {},
        select: { id: true },
      });
      return thread.id;
    },

    async findThreadIdForRequest(requestId: string): Promise<string | null> {
      const row = await db.chatThread.findUnique({ where: { requestId }, select: { id: true } });
      return row?.id ?? null;
    },

    async findThread(id: string): Promise<ThreadRecord | null> {
      const row = await db.chatThread.findUnique({
        where: { id },
        select: {
          id: true,
          requestId: true,
          brandId: true,
          creatorId: true,
          createdAt: true,
          brandLastReadAt: true,
          creatorLastReadAt: true,
          brand: { select: { name: true } },
          creator: { select: { userId: true, displayName: true, slug: true } },
          request: { select: { campaign: { select: { name: true } } } },
        },
      });
      if (!row) return null;
      const { brand, creator, request, ...rest } = row;
      return {
        ...rest,
        brandName: brand.name,
        creatorUserId: creator.userId,
        creatorDisplayName: creator.displayName,
        creatorSlug: creator.slug,
        campaignName: request.campaign.name,
      };
    },

    countMessages: (threadId: string): Promise<number> => db.message.count({ where: { threadId } }),

    /** Adds a message; the thread's activity time and the sender's read position move on. */
    async addMessage(message: NewMessage): Promise<string> {
      const { attachment, ...fields } = message;
      const created = await db.message.create({
        data: {
          ...fields,
          contactFlags: [...fields.contactFlags],
          ...(attachment ? { attachment: { create: attachment } } : {}),
        },
        select: { id: true },
      });
      await db.chatThread.update({
        where: { id: message.threadId },
        data: {
          lastMessageAt: message.createdAt,
          [lastReadField(message.senderSide)]: message.createdAt,
        },
      });
      return created.id;
    },

    /**
     * A page of messages, oldest first, ending before `beforeMessageId` (or at the newest).
     * `hasOlder` says whether an earlier page exists.
     */
    async listMessages(
      threadId: string,
      page: { beforeMessageId?: string; limit: number },
    ): Promise<{ messages: MessageRecord[]; hasOlder: boolean }> {
      const rows = await db.message.findMany({
        where: { threadId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(page.beforeMessageId ? { cursor: { id: page.beforeMessageId }, skip: 1 } : {}),
        take: page.limit + 1,
        select: {
          id: true,
          senderSide: true,
          body: true,
          contactFlags: true,
          createdAt: true,
          sender: { select: { name: true } },
          attachment: {
            select: { storageKey: true, fileName: true, contentType: true, sizeBytes: true },
          },
        },
      });
      const hasOlder = rows.length > page.limit;
      const messages = rows
        .slice(0, page.limit)
        .reverse()
        .map(({ sender, ...row }) => ({ ...row, senderName: sender?.name ?? null }));
      return { messages, hasOlder };
    },

    /** True when the message belongs to the thread (for paging cursors from the URL). */
    async isMessageInThread(threadId: string, messageId: string): Promise<boolean> {
      return (await db.message.count({ where: { id: messageId, threadId } })) > 0;
    },

    async markRead(threadId: string, side: CollabSide, at: Date): Promise<void> {
      await db.chatThread.update({ where: { id: threadId }, data: { [lastReadField(side)]: at } });
    },

    async listThreads(
      owner: { brandId: string } | { creatorId: string },
      page: { offset: number; limit: number },
    ): Promise<{ items: ThreadSummary[]; total: number }> {
      const [rows, total] = await Promise.all([
        db.chatThread.findMany({
          where: owner,
          orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
          skip: page.offset,
          take: page.limit,
          select: THREAD_SUMMARY_SELECT,
        }),
        db.chatThread.count({ where: owner }),
      ]);
      return { items: rows.map(toSummary), total };
    },

    /** Unread messages per thread for one side, in a single query (no N+1). */
    async unreadCounts(
      threads: readonly ThreadSummary[],
      side: CollabSide,
    ): Promise<Map<string, number>> {
      if (threads.length === 0) return new Map();
      const otherSide: CollabSide = side === 'BRAND' ? 'CREATOR' : 'BRAND';
      const groups = await db.message.groupBy({
        by: ['threadId'],
        where: {
          senderSide: otherSide,
          OR: threads.map((thread) => ({
            threadId: thread.id,
            createdAt: { gt: thread[lastReadField(side)] ?? new Date(0) },
          })),
        },
        _count: { _all: true },
      });
      return new Map(groups.map((group) => [group.threadId, group._count._all]));
    },

    /** FR-8.3: all unread messages for a brand or a creator (navigation badge). */
    async countUnread(owner: { brandId: string } | { creatorId: string }): Promise<number> {
      const rows =
        'brandId' in owner
          ? await db.$queryRaw<{ count: bigint }[]>`
              SELECT count(*) AS count FROM "Message" m
              JOIN "ChatThread" t ON t.id = m."threadId"
              WHERE t."brandId" = ${owner.brandId} AND m."senderSide" = 'CREATOR'
                AND (t."brandLastReadAt" IS NULL OR m."createdAt" > t."brandLastReadAt")`
          : await db.$queryRaw<{ count: bigint }[]>`
              SELECT count(*) AS count FROM "Message" m
              JOIN "ChatThread" t ON t.id = m."threadId"
              WHERE t."creatorId" = ${owner.creatorId} AND m."senderSide" = 'BRAND'
                AND (t."creatorLastReadAt" IS NULL OR m."createdAt" > t."creatorLastReadAt")`;
      return Number(rows[0]?.count ?? 0);
    },
  };
}
