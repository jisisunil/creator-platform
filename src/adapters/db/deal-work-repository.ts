import { z } from 'zod';
import type { CollabSide } from '@/domain/chat';
import type { ContractTerms } from '@/domain/contracts';
import { DELIVERABLES, USAGE_RIGHTS } from '@/domain/requests';
import type { Prisma } from '@/generated/prisma/client';
import type { DbClient } from './db-client';

export type ContractSource = 'GENERATED' | 'UPLOADED';
export type SubmissionReview = 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'AUTO_APPROVED';

export interface ContractRecord {
  readonly id: string;
  readonly dealId: string;
  readonly version: number;
  readonly source: ContractSource;
  readonly templateVersion: number;
  readonly terms: ContractTerms;
  readonly additionalTerms: string | null;
  readonly fileStorageKey: string | null;
  readonly fileName: string | null;
  readonly fileSizeBytes: number | null;
  readonly fingerprint: string;
  readonly createdAt: Date;
  readonly acceptances: readonly { readonly side: CollabSide; readonly acceptedAt: Date }[];
}

export interface SubmissionFileRecord {
  readonly id: string;
  readonly storageKey: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export interface SubmissionRecord {
  readonly id: string;
  readonly round: number;
  readonly note: string;
  readonly links: readonly string[];
  readonly submittedAt: Date;
  readonly review: SubmissionReview;
  readonly reviewNote: string | null;
  readonly reviewedAt: Date | null;
  readonly files: readonly SubmissionFileRecord[];
}

/** Stored contract terms are checked on the way out, like any external data. */
const storedTermsSchema = z.object({
  brandName: z.string(),
  creatorName: z.string(),
  campaignName: z.string(),
  brief: z.string(),
  deliverables: z.array(
    z.object({ deliverable: z.enum(DELIVERABLES), quantity: z.number().int().min(1) }),
  ),
  usageRights: z.enum(USAGE_RIGHTS),
  amountMinor: z.number().int().min(0),
  currencyCode: z.string(),
  advancePercent: z.number().int().min(0).max(100).nullable(),
  paymentDueOn: z.string().nullable(),
  deadline: z.string(),
  reviewDays: z.number().int().min(1),
  maxChangeRequests: z.number().int().min(0),
});

const CONTRACT_SELECT = {
  id: true,
  dealId: true,
  version: true,
  source: true,
  templateVersion: true,
  terms: true,
  additionalTerms: true,
  fileStorageKey: true,
  fileName: true,
  fileSizeBytes: true,
  fingerprint: true,
  createdAt: true,
  acceptances: { orderBy: { acceptedAt: 'asc' }, select: { side: true, acceptedAt: true } },
} as const satisfies Prisma.DealContractSelect;

type ContractRow = Prisma.DealContractGetPayload<{ select: typeof CONTRACT_SELECT }>;

function toContract(row: ContractRow): ContractRecord {
  return { ...row, terms: storedTermsSchema.parse(row.terms) };
}

const SUBMISSION_SELECT = {
  id: true,
  round: true,
  note: true,
  links: true,
  submittedAt: true,
  review: true,
  reviewNote: true,
  reviewedAt: true,
  files: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, storageKey: true, fileName: true, contentType: true, sizeBytes: true },
  },
} as const satisfies Prisma.DealSubmissionSelect;

export type DealWorkRepository = ReturnType<typeof createDealWorkRepository>;

/** A deal's contract versions and its proof-of-work submissions (ADR-012). */
export function createDealWorkRepository(db: DbClient) {
  return {
    /** The latest contract version, or null before one is issued. */
    async currentContract(dealId: string): Promise<ContractRecord | null> {
      const row = await db.dealContract.findFirst({
        where: { dealId },
        orderBy: { version: 'desc' },
        select: CONTRACT_SELECT,
      });
      return row ? toContract(row) : null;
    },

    /**
     * Adds the next contract version, accepted by its issuer's side. Two issues at once
     * can't both get the same version (unique dealId + version).
     */
    async issueContract(data: {
      dealId: string;
      source: ContractSource;
      templateVersion: number;
      terms: ContractTerms;
      additionalTerms: string | null;
      file: { storageKey: string; fileName: string; sizeBytes: number } | null;
      fingerprint: string;
      issuedByUserId: string;
      issuerSide: CollabSide;
      issuedAt: Date;
    }): Promise<{ id: string; version: number }> {
      const latest = await db.dealContract.findFirst({
        where: { dealId: data.dealId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;
      const created = await db.dealContract.create({
        data: {
          dealId: data.dealId,
          version,
          source: data.source,
          templateVersion: data.templateVersion,
          terms: {
            ...data.terms,
            deliverables: data.terms.deliverables.map((line) => ({ ...line })),
          },
          additionalTerms: data.additionalTerms,
          fileStorageKey: data.file?.storageKey ?? null,
          fileName: data.file?.fileName ?? null,
          fileSizeBytes: data.file?.sizeBytes ?? null,
          fingerprint: data.fingerprint,
          issuedByUserId: data.issuedByUserId,
          createdAt: data.issuedAt,
          acceptances: {
            create: {
              side: data.issuerSide,
              userId: data.issuedByUserId,
              acceptedAt: data.issuedAt,
            },
          },
        },
        select: { id: true },
      });
      return { id: created.id, version };
    },

    /** Records one side's acceptance; false when that side already accepted this version. */
    async acceptContract(data: {
      contractId: string;
      side: CollabSide;
      userId: string;
      acceptedAt: Date;
    }): Promise<boolean> {
      const result = await db.dealContractAcceptance.createMany({
        data: [data],
        skipDuplicates: true,
      });
      return result.count === 1;
    },

    /** Every submission of a deal, oldest first, with its files. */
    async listSubmissions(dealId: string): Promise<SubmissionRecord[]> {
      return db.dealSubmission.findMany({
        where: { dealId },
        orderBy: { round: 'asc' },
        select: SUBMISSION_SELECT,
      });
    },

    async countChangeRequests(dealId: string): Promise<number> {
      return db.dealSubmission.count({ where: { dealId, review: 'CHANGES_REQUESTED' } });
    },

    async addSubmission(data: {
      dealId: string;
      note: string;
      links: readonly string[];
      files: readonly Omit<SubmissionFileRecord, 'id'>[];
      submittedByUserId: string;
      submittedAt: Date;
    }): Promise<void> {
      const round = (await db.dealSubmission.count({ where: { dealId: data.dealId } })) + 1;
      await db.dealSubmission.create({
        data: {
          dealId: data.dealId,
          round,
          note: data.note,
          links: [...data.links],
          submittedByUserId: data.submittedByUserId,
          submittedAt: data.submittedAt,
          files: { create: data.files.map((file) => ({ ...file })) },
        },
      });
    },

    /** Answers the pending submission (deals from before ADR-012 may have none). */
    async reviewPendingSubmission(
      dealId: string,
      review: {
        review: Exclude<SubmissionReview, 'PENDING'>;
        reviewNote: string | null;
        reviewedByUserId: string | null;
        reviewedAt: Date;
      },
    ): Promise<void> {
      await db.dealSubmission.updateMany({ where: { dealId, review: 'PENDING' }, data: review });
    },
  };
}
