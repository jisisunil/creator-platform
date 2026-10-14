import type { BillingPeriod, PlanCode } from '@/generated/prisma/enums';

export interface PlanDefinition {
  readonly code: PlanCode;
  readonly countryCode: string;
  /** Price in the smallest currency unit (paise for INR). */
  readonly priceMinor: number;
  readonly currencyCode: string;
  readonly billingPeriod: BillingPeriod;
  readonly contactRequestsPerPeriod: number;
  readonly seatLimit: number;
  readonly shortlistLimit: number;
  readonly profileViewsPerHour: number;
  readonly trialDays: number | null;
  readonly canSaveSearch: boolean;
  readonly canCompare: boolean;
  readonly canCampaignReports: boolean;
  readonly canCsvExport: boolean;
  /** Pay-as-you-go: contact requests come from credit packs instead of a monthly allowance. */
  readonly usesCreditPacks: boolean;
}

const INDIA = { countryCode: 'IN', currencyCode: 'INR' } as const;

/**
 * Starting plans from the spec's "Monetisation and plans" table. Prices and request limits
 * come from the spec; shortlist and profile-view limits are placeholder assumptions to tune.
 * Admins can change the seeded rows (FR-11.3).
 */
export const PLAN_DEFINITIONS: readonly PlanDefinition[] = [
  {
    ...INDIA,
    code: 'FREE_BETA',
    priceMinor: 0,
    billingPeriod: 'MONTHLY',
    contactRequestsPerPeriod: 500,
    seatLimit: 1,
    shortlistLimit: 50,
    profileViewsPerHour: 300,
    trialDays: null,
    canSaveSearch: true,
    canCompare: true,
    canCampaignReports: true,
    canCsvExport: true,
    usesCreditPacks: false,
  },
  {
    ...INDIA,
    code: 'TRIAL',
    priceMinor: 0,
    billingPeriod: 'NONE',
    contactRequestsPerPeriod: 10,
    seatLimit: 1,
    shortlistLimit: 5,
    profileViewsPerHour: 60,
    trialDays: 14,
    canSaveSearch: false,
    canCompare: false,
    canCampaignReports: false,
    canCsvExport: false,
    usesCreditPacks: false,
  },
  {
    ...INDIA,
    code: 'PAY_AS_YOU_GO',
    priceMinor: 0, // pays per credit pack, not per period
    billingPeriod: 'NONE',
    contactRequestsPerPeriod: 0, // credits come from packs
    seatLimit: 1,
    shortlistLimit: 10,
    profileViewsPerHour: 100,
    trialDays: null,
    canSaveSearch: false,
    canCompare: false,
    canCampaignReports: false,
    canCsvExport: false,
    usesCreditPacks: true,
  },
  {
    ...INDIA,
    code: 'STARTER',
    priceMinor: 199_900,
    billingPeriod: 'MONTHLY',
    contactRequestsPerPeriod: 50,
    seatLimit: 1,
    shortlistLimit: 20,
    profileViewsPerHour: 150,
    trialDays: null,
    canSaveSearch: true,
    canCompare: true,
    canCampaignReports: false,
    canCsvExport: false,
    usesCreditPacks: false,
  },
  {
    ...INDIA,
    code: 'PRO',
    priceMinor: 499_900,
    billingPeriod: 'MONTHLY',
    contactRequestsPerPeriod: 200,
    seatLimit: 3,
    shortlistLimit: 50,
    profileViewsPerHour: 300,
    trialDays: null,
    canSaveSearch: true,
    canCompare: true,
    canCampaignReports: true,
    canCsvExport: true,
    usesCreditPacks: false,
  },
  {
    ...INDIA,
    code: 'AGENCY',
    priceMinor: 1_499_900,
    billingPeriod: 'MONTHLY',
    contactRequestsPerPeriod: 1000,
    seatLimit: 10,
    shortlistLimit: 200,
    profileViewsPerHour: 600,
    trialDays: null,
    canSaveSearch: true,
    canCompare: true,
    canCampaignReports: true,
    canCsvExport: true,
    usesCreditPacks: false,
  },
];

/** Pay-as-you-go credit packs (spec: ₹499 per 10, ₹1,999 per 50, valid 90 days). */
export const CREDIT_PACKS = [
  { code: 'PACK_10', credits: 10, priceMinor: 49_900, currencyCode: 'INR', validDays: 90 },
  { code: 'PACK_50', credits: 50, priceMinor: 199_900, currencyCode: 'INR', validDays: 90 },
] as const;

export type CreditPackCode = (typeof CREDIT_PACKS)[number]['code'];

/** FR-11.3: the longest single trial extension an admin can give. */
export const MAX_TRIAL_EXTENSION_DAYS = 90;

/** Trial reminder: this many days before the trial ends. */
export const TRIAL_ENDING_NOTICE_DAYS = 3;
