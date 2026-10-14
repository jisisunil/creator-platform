import type { NoticeVersion } from '@/domain/consent';
import type { DbClient } from './db-client';

export interface CountryRecord {
  readonly code: string;
  readonly defaultLocale: string;
  readonly currencyCode: string;
  readonly privacyNoticeVersion: string;
  readonly isEnabled: boolean;
}

export interface PlanSummary {
  readonly id: string;
  readonly code: string;
  readonly trialDays: number | null;
  readonly seatLimit: number;
}

export type ReferenceRepository = ReturnType<typeof createReferenceRepository>;

/** Read access to configuration tables: countries, notices, plans, platform settings. */
export function createReferenceRepository(db: DbClient) {
  return {
    findCountry: (code: string): Promise<CountryRecord | null> =>
      db.countrySettings.findUnique({
        where: { code },
        select: {
          code: true,
          defaultLocale: true,
          currencyCode: true,
          privacyNoticeVersion: true,
          isEnabled: true,
        },
      }),

    listPrivacyNotices: (countryCode: string): Promise<NoticeVersion[]> =>
      db.privacyNotice.findMany({
        where: { countryCode },
        orderBy: { publishedAt: 'asc' },
        select: { version: true, publishedAt: true, isMaterialChange: true },
      }),

    findPlan: (code: 'FREE_BETA' | 'TRIAL', countryCode: string): Promise<PlanSummary | null> =>
      db.plan.findUnique({
        where: { code_countryCode: { code, countryCode } },
        select: { id: true, code: true, trialDays: true, seatLimit: true },
      }),

    async getBooleanSetting(key: string, fallback: boolean): Promise<boolean> {
      const row = await db.platformSetting.findUnique({ where: { key }, select: { value: true } });
      return typeof row?.value === 'boolean' ? row.value : fallback;
    },
  };
}
