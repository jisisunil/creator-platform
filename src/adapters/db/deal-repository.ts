import type { CollabSide } from '@/domain/chat';
import type { DealStatus } from '@/domain/deals';
import type { DeliverableLine, UsageRights } from '@/domain/requests';
import type { Prisma } from '@/generated/prisma/client';
import type { SocialPlatform } from '../social/provider';
import type { DbClient } from './db-client';
import { parseStoredDeliverables } from './request-repository';

export type DealEventKind =
  | 'CREATED'
  | 'TERMS_UPDATED'
  | 'CONTENT_SUBMITTED'
  | 'POST_ADDED'
  | 'PAYMENT_MARKED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_DISPUTED'
  | 'CANCELLED'
  | 'DEADLINE_REMINDER'
  | 'PAYMENT_REMINDER';

export type DealPostStatus = 'LIVE' | 'DELETED' | 'PRIVATE';

export interface DealPostRecord {
  readonly id: string;
  readonly platform: SocialPlatform;
  readonly url: string;
  readonly views: number | null;
  readonly likes: number;
  readonly comments: number;
  readonly statsFetchedAt: Date | null;
  readonly status: DealPostStatus;
}

export interface DealRecord {
  readonly id: string;
  readonly requestId: string;
  readonly campaignId: string;
  readonly campaignName: string;
  readonly brandId: string;
  readonly brandName: string;
  readonly creatorId: string;
  readonly creatorUserId: string;
  readonly creatorDisplayName: string;
  readonly creatorSlug: string;
  /** The team member who sent the request, if still known. */
  readonly sentByUserId: string | null;
  readonly status: DealStatus;
  readonly agreedAmountMinor: number | null;
  readonly currencyCode: string;
  readonly advancePercent: number | null;
  readonly paymentDueOn: Date | null;
  readonly deadline: Date;
  readonly brief: string;
  readonly deliverables: readonly DeliverableLine[];
  readonly usageRights: UsageRights;
  readonly postedAt: Date | null;
  readonly paymentMarkedAt: Date | null;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelledBySide: CollabSide | null;
  readonly cancelReason: string | null;
  readonly deadlineReminderSentAt: Date | null;
  readonly paymentReminderSentAt: Date | null;
  readonly createdAt: Date;
  readonly posts: readonly DealPostRecord[];
}

export interface DealEventRecord {
  readonly id: string;
  readonly kind: DealEventKind;
  readonly actorSide: CollabSide | null;
  readonly note: string | null;
  readonly createdAt: Date;
}

export interface DealSummary {
  readonly id: string;
  readonly campaignName: string;
  readonly brandName: string;
  readonly creatorDisplayName: string;
  readonly status: DealStatus;
  readonly agreedAmountMinor: number | null;
  readonly currencyCode: string;
  readonly deadline: Date;
  readonly updatedAt: Date;
}

/** Fields a status change may set alongside the status. */
export interface DealChanges {
  readonly agreedAmountMinor?: number | null;
  readonly advancePercent?: number | null;
  readonly paymentDueOn?: Date | null;
  readonly postedAt?: Date;
  readonly paymentMarkedAt?: Date;
  readonly completedAt?: Date;
  readonly cancelledAt?: Date;
  readonly cancelledBySide?: CollabSide;
  readonly cancelReason?: string;
}

const POST_SELECT = {
  id: true,
  platform: true,
  url: true,
  views: true,
  likes: true,
  comments: true,
  statsFetchedAt: true,
  status: true,
} as const satisfies Prisma.DealPostSelect;

const DEAL_SELECT = {
  id: true,
  requestId: true,
  campaignId: true,
  brandId: true,
  creatorId: true,
  status: true,
  agreedAmountMinor: true,
  currencyCode: true,
  advancePercent: true,
  paymentDueOn: true,
  deadline: true,
  postedAt: true,
  paymentMarkedAt: true,
  completedAt: true,
  cancelledAt: true,
  cancelledBySide: true,
  cancelReason: true,
  deadlineReminderSentAt: true,
  paymentReminderSentAt: true,
  createdAt: true,
  campaign: { select: { name: true } },
  brand: { select: { name: true } },
  creator: { select: { userId: true, displayName: true, slug: true } },
  request: {
    select: { sentByUserId: true, brief: true, deliverables: true, usageRights: true },
  },
  posts: { orderBy: { createdAt: 'asc' }, select: POST_SELECT },
} as const satisfies Prisma.DealSelect;

type DealRow = Prisma.DealGetPayload<{ select: typeof DEAL_SELECT }>;

function toRecord(row: DealRow): DealRecord {
  const { campaign, brand, creator, request, ...rest } = row;
  return {
    ...rest,
    campaignName: campaign.name,
    brandName: brand.name,
    creatorUserId: creator.userId,
    creatorDisplayName: creator.displayName,
    creatorSlug: creator.slug,
    sentByUserId: request.sentByUserId,
    brief: request.brief,
    deliverables: parseStoredDeliverables(request.deliverables),
    usageRights: request.usageRights,
  };
}

export type DealRepository = ReturnType<typeof createDealRepository>;

/** Deals, their history and posts (FR-9, UC-R4 to UC-R6). */
export function createDealRepository(db: DbClient) {
  return {
    async create(data: {
      requestId: string;
      campaignId: string;
      brandId: string;
      creatorId: string;
      agreedAmountMinor: number | null;
      currencyCode: string;
      deadline: Date;
      createdAt: Date;
    }): Promise<string> {
      const created = await db.deal.create({
        data: { ...data, events: { create: { kind: 'CREATED', createdAt: data.createdAt } } },
        select: { id: true },
      });
      return created.id;
    },

    async findById(id: string): Promise<DealRecord | null> {
      const row = await db.deal.findUnique({ where: { id }, select: DEAL_SELECT });
      return row ? toRecord(row) : null;
    },

    async findIdForRequest(requestId: string): Promise<string | null> {
      const row = await db.deal.findUnique({ where: { requestId }, select: { id: true } });
      return row?.id ?? null;
    },

    async listEvents(dealId: string): Promise<DealEventRecord[]> {
      return db.dealEvent.findMany({
        where: { dealId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, kind: true, actorSide: true, note: true, createdAt: true },
      });
    },

    async list(
      owner: { brandId: string } | { creatorId: string },
      page: { offset: number; limit: number },
    ): Promise<{ items: DealSummary[]; total: number }> {
      const [rows, total] = await Promise.all([
        db.deal.findMany({
          where: owner,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          skip: page.offset,
          take: page.limit,
          select: {
            id: true,
            status: true,
            agreedAmountMinor: true,
            currencyCode: true,
            deadline: true,
            updatedAt: true,
            campaign: { select: { name: true } },
            brand: { select: { name: true } },
            creator: { select: { displayName: true } },
          },
        }),
        db.deal.count({ where: owner }),
      ]);
      return {
        items: rows.map(({ campaign, brand, creator, ...rest }) => ({
          ...rest,
          campaignName: campaign.name,
          brandName: brand.name,
          creatorDisplayName: creator.displayName,
        })),
        total,
      };
    },

    /**
     * Moves the deal from `from` to `to` with any changed fields, only if it is still in
     * `from`: two people acting at once can't both succeed (UC-R4).
     */
    async transition(
      id: string,
      from: DealStatus,
      to: DealStatus,
      changes: DealChanges = {},
    ): Promise<boolean> {
      const result = await db.deal.updateMany({
        where: { id, status: from },
        data: { ...changes, status: to },
      });
      return result.count === 1;
    },

    async addEvent(event: {
      dealId: string;
      kind: DealEventKind;
      actorUserId: string | null;
      actorSide: CollabSide | null;
      note?: string | null;
      createdAt: Date;
    }): Promise<void> {
      await db.dealEvent.create({ data: event });
    },

    async addPost(post: {
      dealId: string;
      socialAccountId: string;
      platform: SocialPlatform;
      url: string;
      externalPostId: string;
      views: number | null;
      likes: number;
      comments: number;
      statsFetchedAt: Date;
    }): Promise<boolean> {
      const existing = await db.dealPost.count({
        where: {
          dealId: post.dealId,
          platform: post.platform,
          externalPostId: post.externalPostId,
        },
      });
      if (existing > 0) return false;
      await db.dealPost.create({ data: post });
      return true;
    },

    /** Posts whose stats are older than `staleBefore`, from deals posted since `postedSince`. */
    async postsDueForRefresh(
      staleBefore: Date,
      postedSince: Date,
      limit: number,
    ): Promise<
      {
        id: string;
        platform: SocialPlatform;
        externalPostId: string;
        socialAccountId: string | null;
      }[]
    > {
      return db.dealPost.findMany({
        where: {
          status: 'LIVE',
          OR: [{ statsFetchedAt: null }, { statsFetchedAt: { lt: staleBefore } }],
          deal: { status: { not: 'CANCELLED' }, postedAt: { gte: postedSince } },
        },
        orderBy: { statsFetchedAt: { sort: 'asc', nulls: 'first' } },
        take: limit,
        select: { id: true, platform: true, externalPostId: true, socialAccountId: true },
      });
    },

    async updatePost(
      id: string,
      data:
        | {
            status: 'LIVE';
            views: number | null;
            likes: number;
            comments: number;
            statsFetchedAt: Date;
          }
        | { status: 'DELETED' | 'PRIVATE'; statsFetchedAt: Date },
    ): Promise<void> {
      await db.dealPost.update({ where: { id }, data });
    },

    /**
     * Deals that may need a deadline or payment reminder (UC-R4, UC-R5): content past its
     * deadline, or posted deals whose payment date (or `postedBefore`, without one) passed.
     * The domain rules make the final call.
     */
    async remindableDeals(now: Date, postedBefore: Date, limit: number): Promise<DealRecord[]> {
      const rows = await db.deal.findMany({
        where: {
          OR: [
            {
              status: { in: ['ACCEPTED', 'CONTENT_SUBMITTED'] },
              deadline: { lt: now },
              deadlineReminderSentAt: null,
            },
            { status: 'POSTED', paymentDueOn: { lt: now } },
            { status: 'POSTED', paymentDueOn: null, postedAt: { lte: postedBefore } },
          ],
        },
        orderBy: { deadline: 'asc' },
        take: limit,
        select: DEAL_SELECT,
      });
      return rows.map(toRecord);
    },

    async markReminderSent(
      id: string,
      field: 'deadlineReminderSentAt' | 'paymentReminderSentAt',
      at: Date,
    ): Promise<void> {
      await db.deal.update({ where: { id }, data: { [field]: at } });
    },

    /** Every deal of a campaign with its posts, for the report (FR-9.3). */
    async listForCampaign(campaignId: string): Promise<DealRecord[]> {
      const rows = await db.deal.findMany({
        where: { campaignId },
        orderBy: { createdAt: 'asc' },
        select: DEAL_SELECT,
      });
      return rows.map(toRecord);
    },

    async listCampaigns(brandId: string): Promise<
      {
        id: string;
        name: string;
        requestCount: number;
        dealCount: number;
        updatedAt: Date;
      }[]
    > {
      const rows = await db.campaign.findMany({
        where: { brandId },
        orderBy: { updatedAt: 'desc' },
        take: 200,
        select: {
          id: true,
          name: true,
          updatedAt: true,
          _count: { select: { requests: true, deals: true } },
        },
      });
      return rows.map(({ _count, ...row }) => ({
        ...row,
        requestCount: _count.requests,
        dealCount: _count.deals,
      }));
    },

    async findCampaign(id: string): Promise<{ id: string; brandId: string; name: string } | null> {
      return db.campaign.findUnique({
        where: { id },
        select: { id: true, brandId: true, name: true },
      });
    },
  };
}
