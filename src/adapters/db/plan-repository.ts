import type { CreditPackBalance } from '@/domain/plans';
import type { PlanCode } from '@/generated/prisma/enums';
import type { DbClient } from './db-client';

export type { PlanCode } from '@/generated/prisma/enums';

export interface PlanRecord {
  readonly id: string;
  readonly code: PlanCode;
  readonly priceMinor: number;
  readonly currencyCode: string;
  readonly billingPeriod: 'NONE' | 'MONTHLY';
  readonly contactRequestsPerPeriod: number;
  readonly seatLimit: number;
  readonly shortlistLimit: number;
  readonly trialDays: number | null;
  readonly canSaveSearch: boolean;
  readonly canCompare: boolean;
  readonly canCampaignReports: boolean;
  readonly canCsvExport: boolean;
  readonly usesCreditPacks: boolean;
}

export interface CreditPackRecord extends CreditPackBalance {
  readonly priceMinor: number;
  readonly currencyCode: string;
  readonly createdAt: Date;
}

export interface TrialNoticeCandidate {
  readonly brandId: string;
  readonly brandName: string;
  readonly trialEndsAt: Date | null;
  readonly trialEndingNoticeSentAt: Date | null;
  readonly trialEndedNoticeSentAt: Date | null;
}

const PLAN_SELECT = {
  id: true,
  code: true,
  priceMinor: true,
  currencyCode: true,
  billingPeriod: true,
  contactRequestsPerPeriod: true,
  seatLimit: true,
  shortlistLimit: true,
  trialDays: true,
  canSaveSearch: true,
  canCompare: true,
  canCampaignReports: true,
  canCsvExport: true,
  usesCreditPacks: true,
} as const;

export type PlanRepository = ReturnType<typeof createPlanRepository>;

/** Plans, a brand's plan and trial, and pay-as-you-go credit packs (FR-11, UC-B1 to UC-B3). */
export function createPlanRepository(db: DbClient) {
  return {
    /** Active plans of a country, cheapest first (FR-11.2 upgrade options). */
    listPlans: (countryCode: string): Promise<PlanRecord[]> =>
      db.plan.findMany({
        where: { countryCode, isActive: true },
        orderBy: [{ priceMinor: 'asc' }, { contactRequestsPerPeriod: 'asc' }],
        select: PLAN_SELECT,
      }),

    findPlan: (code: PlanCode, countryCode: string): Promise<PlanRecord | null> =>
      db.plan.findFirst({ where: { code, countryCode }, select: PLAN_SELECT }),

    async findBrand(brandId: string): Promise<{
      id: string;
      name: string;
      countryCode: string;
      planCode: PlanCode;
      trialEndsAt: Date | null;
    } | null> {
      const row = await db.brand.findUnique({
        where: { id: brandId },
        select: {
          id: true,
          name: true,
          countryCode: true,
          trialEndsAt: true,
          plan: { select: { code: true } },
        },
      });
      return row ? { ...row, planCode: row.plan.code } : null;
    },

    /** UC-B1: a brand with this company email domain has already had a trial. */
    async hasCompanyHadTrial(emailDomain: string): Promise<boolean> {
      return (await db.brand.count({ where: { emailDomain, hasHadTrial: true } })) > 0;
    },

    /** FR-11.3 / UC-B3: puts the brand on a plan; a new plan period starts now. */
    async setBrandPlan(
      brandId: string,
      plan: { planId: string; planStartedAt: Date; trialEndsAt: Date | null },
    ): Promise<void> {
      await db.brand.update({
        where: { id: brandId },
        data: {
          ...plan,
          ...(plan.trialEndsAt ? { hasHadTrial: true } : {}),
          trialEndingNoticeSentAt: null,
          trialEndedNoticeSentAt: null,
        },
      });
    },

    async setTrialEndsAt(brandId: string, trialEndsAt: Date): Promise<void> {
      await db.brand.update({
        where: { id: brandId },
        data: { trialEndsAt, trialEndingNoticeSentAt: null, trialEndedNoticeSentAt: null },
      });
    },

    async listCreditPacks(brandId: string): Promise<CreditPackRecord[]> {
      return db.creditPack.findMany({
        where: { brandId },
        orderBy: { expiresAt: 'asc' },
        select: {
          id: true,
          credits: true,
          creditsUsed: true,
          expiresAt: true,
          priceMinor: true,
          currencyCode: true,
          createdAt: true,
        },
      });
    },

    async addCreditPack(pack: {
      brandId: string;
      credits: number;
      priceMinor: number;
      currencyCode: string;
      expiresAt: Date;
      addedByUserId: string;
      createdAt: Date;
    }): Promise<string> {
      const created = await db.creditPack.create({ data: pack, select: { id: true } });
      return created.id;
    },

    /** Takes one credit from the pack; false if it has none left (another request won). */
    async useCredit(packId: string): Promise<boolean> {
      const rows = await db.$executeRaw`
        UPDATE "CreditPack" SET "creditsUsed" = "creditsUsed" + 1, "updatedAt" = now()
        WHERE id = ${packId} AND "creditsUsed" < credits`;
      return rows === 1;
    },

    /** Trial brands whose trial ends before `endingBefore` and still miss a notice. */
    async trialNoticeCandidates(
      endingBefore: Date,
      limit: number,
    ): Promise<TrialNoticeCandidate[]> {
      const rows = await db.brand.findMany({
        where: {
          plan: { code: 'TRIAL' },
          trialEndsAt: { lte: endingBefore },
          OR: [{ trialEndingNoticeSentAt: null }, { trialEndedNoticeSentAt: null }],
        },
        orderBy: { trialEndsAt: 'asc' },
        take: limit,
        select: {
          id: true,
          name: true,
          trialEndsAt: true,
          trialEndingNoticeSentAt: true,
          trialEndedNoticeSentAt: true,
        },
      });
      return rows.map(({ id, name, ...rest }) => ({ brandId: id, brandName: name, ...rest }));
    },

    /** Records a trial notice; "ended" also counts as "ending" so neither is sent again. */
    async markTrialNotice(brandId: string, notice: 'ENDING' | 'ENDED', at: Date): Promise<void> {
      await db.brand.updateMany({
        where: { id: brandId, trialEndingNoticeSentAt: null },
        data: { trialEndingNoticeSentAt: at },
      });
      if (notice === 'ENDED') {
        await db.brand.update({ where: { id: brandId }, data: { trialEndedNoticeSentAt: at } });
      }
    },
  };
}
