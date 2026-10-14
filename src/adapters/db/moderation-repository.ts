import type { Prisma } from '@/generated/prisma/client';
import type { DbClient } from './db-client';
import type { ReportTarget } from './report-repository';

export type ReportStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';
export type FlagStatus = 'OPEN' | 'CLEARED' | 'SUSPICIOUS';

export interface ReportItem {
  readonly id: string;
  readonly targetType: ReportTarget;
  readonly targetId: string;
  readonly threadId: string | null;
  readonly reason: string;
  readonly status: ReportStatus;
  readonly resolution: string | null;
  readonly createdAt: Date;
  readonly reporter: { readonly id: string; readonly name: string } | null;
}

export interface FlagItem {
  readonly id: string;
  readonly type: 'FOLLOWER_SPIKE' | 'LOW_VIEWS_RATIO' | 'ABNORMAL_ENGAGEMENT';
  readonly status: FlagStatus;
  readonly details: Readonly<Record<string, unknown>>;
  readonly appealText: string | null;
  readonly appealedAt: Date | null;
  readonly createdAt: Date;
  readonly creator: {
    readonly id: string;
    readonly userId: string;
    readonly displayName: string;
    readonly slug: string;
  };
}

export interface DisputeItem {
  readonly id: string;
  readonly isClaimVerified: boolean;
  readonly status: 'OPEN' | 'RESOLVED';
  readonly resolution: string | null;
  readonly createdAt: Date;
  readonly account: {
    readonly id: string;
    readonly platform: 'YOUTUBE' | 'INSTAGRAM';
    readonly handle: string;
    readonly isVerified: boolean;
    readonly verifiedAt: Date | null;
    readonly ownerCreatorId: string;
    readonly ownerUserId: string;
    readonly ownerName: string;
  };
  readonly claimant: { readonly userId: string; readonly name: string };
}

const REPORT_SELECT = {
  id: true,
  targetType: true,
  targetId: true,
  threadId: true,
  reason: true,
  status: true,
  resolution: true,
  createdAt: true,
  reporter: { select: { id: true, name: true } },
} as const satisfies Prisma.ReportSelect;

const FLAG_SELECT = {
  id: true,
  type: true,
  status: true,
  details: true,
  appealText: true,
  appealedAt: true,
  createdAt: true,
  creator: { select: { id: true, userId: true, displayName: true, slug: true } },
} as const satisfies Prisma.AuthenticityFlagSelect;

const DISPUTE_SELECT = {
  id: true,
  isClaimVerified: true,
  status: true,
  resolution: true,
  createdAt: true,
  socialAccount: {
    select: {
      id: true,
      platform: true,
      handle: true,
      isVerified: true,
      verifiedAt: true,
      creator: { select: { id: true, userId: true, displayName: true } },
    },
  },
  claimant: { select: { id: true, name: true } },
} as const satisfies Prisma.OwnershipDisputeSelect;

type FlagRow = Prisma.AuthenticityFlagGetPayload<{ select: typeof FLAG_SELECT }>;
type DisputeRow = Prisma.OwnershipDisputeGetPayload<{ select: typeof DISPUTE_SELECT }>;

function toFlag(row: FlagRow): FlagItem {
  const details =
    row.details && typeof row.details === 'object' && !Array.isArray(row.details)
      ? (row.details as Record<string, unknown>)
      : {};
  return { ...row, details };
}

function toDispute(row: DisputeRow): DisputeItem {
  const { socialAccount: account, claimant, ...rest } = row;
  return {
    ...rest,
    account: {
      id: account.id,
      platform: account.platform,
      handle: account.handle,
      isVerified: account.isVerified,
      verifiedAt: account.verifiedAt,
      ownerCreatorId: account.creator.id,
      ownerUserId: account.creator.userId,
      ownerName: account.creator.displayName,
    },
    claimant: { userId: claimant.id, name: claimant.name },
  };
}

type Page = { offset: number; limit: number };

export type ModerationRepository = ReturnType<typeof createModerationRepository>;

/** Moderation queues: reports, authenticity flags, ownership disputes, chat access (FR-13, UC-M). */
export function createModerationRepository(db: DbClient) {
  return {
    async listReports(status: ReportStatus, page: Page) {
      const where = { status };
      const [items, total] = await Promise.all([
        db.report.findMany({
          where,
          orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
          skip: page.offset,
          take: page.limit,
          select: REPORT_SELECT,
        }),
        db.report.count({ where }),
      ]);
      return { items, total };
    },

    findReport: async (id: string): Promise<ReportItem | null> =>
      db.report.findUnique({ where: { id }, select: REPORT_SELECT }),

    /** UC-M1 "repeated false reports": how many reports this user filed, and how many were dismissed. */
    async reporterHistory(userId: string): Promise<{ total: number; dismissed: number }> {
      const [total, dismissed] = await Promise.all([
        db.report.count({ where: { reporterUserId: userId } }),
        db.report.count({ where: { reporterUserId: userId, status: 'DISMISSED' } }),
      ]);
      return { total, dismissed };
    },

    /** Closes an open report; false if someone already handled it. */
    async closeReport(
      id: string,
      outcome: {
        status: 'RESOLVED' | 'DISMISSED';
        resolution: string;
        handledByUserId: string;
        handledAt: Date;
      },
    ): Promise<boolean> {
      const result = await db.report.updateMany({ where: { id, status: 'OPEN' }, data: outcome });
      return result.count === 1;
    },

    /** Who a report is about, to link the admin to the right account. */
    async describeTarget(targetType: ReportTarget, targetId: string) {
      if (targetType === 'CREATOR') {
        const creator = await db.creatorProfile.findUnique({
          where: { id: targetId },
          select: { displayName: true, userId: true },
        });
        return creator ? { label: creator.displayName, userIds: [creator.userId] } : null;
      }
      if (targetType === 'BRAND') {
        const brand = await db.brand.findUnique({
          where: { id: targetId },
          select: { name: true, members: { select: { userId: true } } },
        });
        return brand
          ? { label: brand.name, userIds: brand.members.map((member) => member.userId) }
          : null;
      }
      if (targetType === 'RATING') {
        const rating = await db.rating.findUnique({
          where: { id: targetId },
          select: {
            comment: true,
            averageTenths: true,
            isHidden: true,
            raterUserId: true,
            dealId: true,
          },
        });
        return rating
          ? {
              label: rating.comment ?? '',
              userIds: rating.raterUserId ? [rating.raterUserId] : [],
              rating,
            }
          : null;
      }
      const deal = await db.deal.findUnique({
        where: { id: targetId },
        select: {
          campaign: { select: { name: true } },
          creator: { select: { userId: true } },
          brand: { select: { members: { select: { userId: true } } } },
        },
      });
      return deal
        ? {
            label: deal.campaign.name,
            userIds: [deal.creator.userId, ...deal.brand.members.map((member) => member.userId)],
          }
        : null;
    },

    async setRatingHidden(ratingId: string, isHidden: boolean): Promise<void> {
      await db.rating.update({ where: { id: ratingId }, data: { isHidden } });
    },

    async createChatGrant(grant: {
      adminUserId: string;
      threadId: string;
      reportId: string | null;
      reason: string;
      expiresAt: Date;
    }): Promise<string> {
      const created = await db.chatAccessGrant.create({ data: grant, select: { id: true } });
      return created.id;
    },

    findChatGrant: (id: string) =>
      db.chatAccessGrant.findUnique({
        where: { id },
        select: { adminUserId: true, threadId: true, expiresAt: true, reason: true },
      }),

    async listFlags(statuses: readonly FlagStatus[], page: Page) {
      const where = { status: { in: [...statuses] } };
      const [rows, total] = await Promise.all([
        db.authenticityFlag.findMany({
          where,
          orderBy: [{ appealedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
          skip: page.offset,
          take: page.limit,
          select: FLAG_SELECT,
        }),
        db.authenticityFlag.count({ where }),
      ]);
      return { items: rows.map(toFlag), total };
    },

    async findFlag(id: string): Promise<FlagItem | null> {
      const row = await db.authenticityFlag.findUnique({ where: { id }, select: FLAG_SELECT });
      return row ? toFlag(row) : null;
    },

    async listFlagsForCreator(creatorId: string): Promise<FlagItem[]> {
      const rows = await db.authenticityFlag.findMany({
        where: { creatorId, status: { in: ['OPEN', 'SUSPICIOUS'] } },
        orderBy: { createdAt: 'desc' },
        select: FLAG_SELECT,
      });
      return rows.map(toFlag);
    },

    /** UC-M2: an admin's decision on an open flag; false if it was already decided. */
    async reviewFlag(
      id: string,
      decision: { status: 'CLEARED' | 'SUSPICIOUS'; reviewedByUserId: string; reviewedAt: Date },
    ): Promise<boolean> {
      const result = await db.authenticityFlag.updateMany({
        where: { id, status: 'OPEN' },
        data: decision,
      });
      return result.count === 1;
    },

    /** UC-M2: the creator appeals a "suspicious" decision; the flag goes back to the queue. */
    async appealFlag(
      id: string,
      creatorId: string,
      appealText: string,
      at: Date,
    ): Promise<boolean> {
      const result = await db.authenticityFlag.updateMany({
        where: { id, creatorId, status: 'SUSPICIOUS' },
        data: { status: 'OPEN', appealText, appealedAt: at },
      });
      return result.count === 1;
    },

    async listDisputes(status: 'OPEN' | 'RESOLVED', page: Page) {
      const where = { status };
      const [rows, total] = await Promise.all([
        db.ownershipDispute.findMany({
          where,
          orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
          skip: page.offset,
          take: page.limit,
          select: DISPUTE_SELECT,
        }),
        db.ownershipDispute.count({ where }),
      ]);
      return { items: rows.map(toDispute), total };
    },

    async findDispute(id: string): Promise<DisputeItem | null> {
      const row = await db.ownershipDispute.findUnique({ where: { id }, select: DISPUTE_SELECT });
      return row ? toDispute(row) : null;
    },

    async resolveDispute(
      id: string,
      outcome: { resolution: string; resolvedByUserId: string; resolvedAt: Date },
    ): Promise<boolean> {
      const result = await db.ownershipDispute.updateMany({
        where: { id, status: 'OPEN' },
        data: { ...outcome, status: 'RESOLVED' },
      });
      return result.count === 1;
    },

    /**
     * UC-M3: moves an account to another creator. The old owner's tokens are removed, so the
     * new owner reconnects through the official login to be verified again.
     */
    async transferAccount(socialAccountId: string, toCreatorId: string): Promise<void> {
      await db.socialAccount.update({
        where: { id: socialAccountId },
        data: {
          creatorId: toCreatorId,
          accessTokenEncrypted: null,
          refreshTokenEncrypted: null,
          tokenExpiresAt: null,
          isVerified: false,
          verifiedAt: null,
        },
      });
    },
  };
}
