import { z } from 'zod';
import {
  type CollabRequestStatus,
  DELIVERABLES,
  type DeliverableLine,
  type UsageRights,
} from '@/domain/requests';
import type { Prisma } from '@/generated/prisma/client';
import type { DbClient } from './db-client';

/** Deliverables JSON is validated when read back, like any external data. */
const storedDeliverablesSchema = z.array(
  z.object({ deliverable: z.enum(DELIVERABLES), quantity: z.number().int().min(1) }),
);

export interface RequestRecord {
  readonly id: string;
  readonly brandId: string;
  readonly brandName: string;
  readonly creatorId: string;
  readonly creatorUserId: string;
  readonly creatorDisplayName: string;
  readonly creatorSlug: string;
  readonly campaignId: string;
  readonly campaignName: string;
  readonly sentByUserId: string | null;
  readonly brief: string;
  readonly deliverables: readonly DeliverableLine[];
  readonly budgetMinor: number | null;
  readonly currencyCode: string;
  readonly deadline: Date;
  readonly usageRights: UsageRights;
  readonly status: CollabRequestStatus;
  readonly version: number;
  readonly declineReason: string | null;
  readonly expiresAt: Date;
  readonly respondedAt: Date | null;
  readonly createdAt: Date;
}

export interface RequestSummary {
  readonly id: string;
  readonly campaignName: string;
  readonly brandName: string;
  readonly creatorDisplayName: string;
  readonly creatorSlug: string;
  readonly status: CollabRequestStatus;
  readonly budgetMinor: number | null;
  readonly currencyCode: string;
  readonly deadline: Date;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface EditableRequestFields {
  readonly campaignId: string;
  readonly brief: string;
  readonly deliverables: readonly DeliverableLine[];
  readonly budgetMinor: number | null;
  readonly deadline: Date;
  readonly usageRights: UsageRights;
}

const RECORD_SELECT = {
  id: true,
  brandId: true,
  creatorId: true,
  campaignId: true,
  sentByUserId: true,
  brief: true,
  deliverables: true,
  budgetMinor: true,
  currencyCode: true,
  deadline: true,
  usageRights: true,
  status: true,
  version: true,
  declineReason: true,
  expiresAt: true,
  respondedAt: true,
  createdAt: true,
  brand: { select: { name: true } },
  creator: { select: { userId: true, displayName: true, slug: true } },
  campaign: { select: { name: true } },
} as const satisfies Prisma.CollabRequestSelect;

const SUMMARY_SELECT = {
  id: true,
  status: true,
  budgetMinor: true,
  currencyCode: true,
  deadline: true,
  expiresAt: true,
  createdAt: true,
  brand: { select: { name: true } },
  creator: { select: { displayName: true, slug: true } },
  campaign: { select: { name: true } },
} as const satisfies Prisma.CollabRequestSelect;

type RecordRow = Prisma.CollabRequestGetPayload<{ select: typeof RECORD_SELECT }>;
type SummaryRow = Prisma.CollabRequestGetPayload<{ select: typeof SUMMARY_SELECT }>;

/** Deliverables JSON from the database, validated. */
export function parseStoredDeliverables(value: unknown): DeliverableLine[] {
  return storedDeliverablesSchema.parse(value);
}

function toJson(lines: readonly DeliverableLine[]): Prisma.InputJsonValue {
  return lines.map((line) => ({ deliverable: line.deliverable, quantity: line.quantity }));
}

function toRecord(row: RecordRow): RequestRecord {
  const { brand, creator, campaign, deliverables, ...rest } = row;
  return {
    ...rest,
    brandName: brand.name,
    creatorUserId: creator.userId,
    creatorDisplayName: creator.displayName,
    creatorSlug: creator.slug,
    campaignName: campaign.name,
    deliverables: parseStoredDeliverables(deliverables),
  };
}

function toSummary(row: SummaryRow): RequestSummary {
  const { brand, creator, campaign, ...rest } = row;
  return {
    ...rest,
    brandName: brand.name,
    creatorDisplayName: creator.displayName,
    creatorSlug: creator.slug,
    campaignName: campaign.name,
  };
}

export type RequestRepository = ReturnType<typeof createRequestRepository>;

/** Collaboration requests, campaigns and blocks (FR-7, UC-R1, UC-R2). */
export function createRequestRepository(db: DbClient) {
  return {
    /** The brand's campaign with this name, created on first use (FR-9.3). */
    async campaignIdFor(brandId: string, name: string): Promise<string> {
      const campaign = await db.campaign.upsert({
        where: { brandId_name: { brandId, name } },
        create: { brandId, name },
        update: {},
        select: { id: true },
      });
      return campaign.id;
    },

    async listCampaignNames(brandId: string): Promise<string[]> {
      const rows = await db.campaign.findMany({
        where: { brandId },
        orderBy: { updatedAt: 'desc' },
        select: { name: true },
        take: 50,
      });
      return rows.map((row) => row.name);
    },

    countSentSince: (brandId: string, since: Date): Promise<number> =>
      db.collabRequest.count({ where: { brandId, createdAt: { gte: since } } }),

    async hasOpenRequest(openPairKey: string): Promise<boolean> {
      return (await db.collabRequest.count({ where: { openPairKey } })) > 0;
    },

    async create(
      data: EditableRequestFields & {
        brandId: string;
        creatorId: string;
        sentByUserId: string;
        currencyCode: string;
        openPairKey: string;
        expiresAt: Date;
        createdAt: Date;
      },
    ): Promise<string> {
      const created = await db.collabRequest.create({
        data: { ...data, deliverables: toJson(data.deliverables) },
        select: { id: true },
      });
      return created.id;
    },

    async findById(id: string): Promise<RequestRecord | null> {
      const row = await db.collabRequest.findUnique({ where: { id }, select: RECORD_SELECT });
      return row ? toRecord(row) : null;
    },

    async listForBrand(
      brandId: string,
      page: { offset: number; limit: number },
    ): Promise<{ items: RequestSummary[]; total: number }> {
      const [rows, total] = await Promise.all([
        db.collabRequest.findMany({
          where: { brandId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: page.offset,
          take: page.limit,
          select: SUMMARY_SELECT,
        }),
        db.collabRequest.count({ where: { brandId } }),
      ]);
      return { items: rows.map(toSummary), total };
    },

    /** Open requests first, newest first within each group. */
    async listForCreator(
      creatorId: string,
      page: { offset: number; limit: number },
    ): Promise<{ items: RequestSummary[]; total: number }> {
      const [rows, total] = await Promise.all([
        db.collabRequest.findMany({
          where: { creatorId },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
          skip: page.offset,
          take: page.limit,
          select: SUMMARY_SELECT,
        }),
        db.collabRequest.count({ where: { creatorId } }),
      ]);
      return { items: rows.map(toSummary), total };
    },

    countOpenForCreator: (creatorId: string, now: Date): Promise<number> =>
      db.collabRequest.count({ where: { creatorId, status: 'OPEN', expiresAt: { gt: now } } }),

    /** UC-R2: edits an open request and bumps its version. False if it is no longer open. */
    async updateOpen(id: string, fields: EditableRequestFields): Promise<boolean> {
      const result = await db.collabRequest.updateMany({
        where: { id, status: 'OPEN' },
        data: {
          ...fields,
          deliverables: toJson(fields.deliverables),
          version: { increment: 1 },
        },
      });
      return result.count === 1;
    },

    /**
     * Moves an open request to its final status. Matching on status and version makes
     * concurrent answers safe: only one succeeds (UC-R2).
     */
    async closeOpen(
      id: string,
      data: {
        status: Exclude<CollabRequestStatus, 'OPEN'>;
        respondedAt: Date;
        expectedVersion?: number;
        declineReason?: string | null;
      },
    ): Promise<boolean> {
      const result = await db.collabRequest.updateMany({
        where: {
          id,
          status: 'OPEN',
          ...(data.expectedVersion === undefined ? {} : { version: data.expectedVersion }),
        },
        data: {
          status: data.status,
          respondedAt: data.respondedAt,
          declineReason: data.declineReason ?? null,
          openPairKey: null,
        },
      });
      return result.count === 1;
    },

    /** FR-7.2: expires every open request past its date. Returns how many. */
    async expireDue(now: Date): Promise<number> {
      const result = await db.collabRequest.updateMany({
        where: { status: 'OPEN', expiresAt: { lte: now } },
        data: { status: 'EXPIRED', openPairKey: null },
      });
      return result.count;
    },

    /** Declines open requests between a creator and a brand (after a block). */
    async declineOpenBetween(creatorId: string, brandId: string, now: Date): Promise<number> {
      const result = await db.collabRequest.updateMany({
        where: { creatorId, brandId, status: 'OPEN' },
        data: { status: 'DECLINED', respondedAt: now, openPairKey: null },
      });
      return result.count;
    },

    /** True when either side has blocked the other. */
    async isBlockedEitherWay(creatorId: string, brandId: string): Promise<boolean> {
      return (await db.block.count({ where: { creatorId, brandId } })) > 0;
    },

    async hasBlocked(
      creatorId: string,
      brandId: string,
      blockedBy: 'CREATOR' | 'BRAND',
    ): Promise<boolean> {
      return (await db.block.count({ where: { creatorId, brandId, blockedBy } })) > 0;
    },

    async addBlock(creatorId: string, brandId: string, blockedBy: 'CREATOR' | 'BRAND') {
      await db.block.upsert({
        where: { creatorId_brandId_blockedBy: { creatorId, brandId, blockedBy } },
        create: { creatorId, brandId, blockedBy },
        update: {},
      });
    },

    async removeBlock(creatorId: string, brandId: string, blockedBy: 'CREATOR' | 'BRAND') {
      await db.block.deleteMany({ where: { creatorId, brandId, blockedBy } });
    },
  };
}
