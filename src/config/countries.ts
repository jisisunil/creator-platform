import type { NumberFormat, SocialPlatform } from '@/generated/prisma/enums';

export interface CountrySettingsDefinition {
  readonly code: string;
  readonly currencyCode: string;
  readonly numberFormat: NumberFormat;
  readonly defaultLocale: string;
  readonly supportedLocales: readonly string[];
  readonly defaultTimezone: string;
  readonly enabledPlatforms: readonly SocialPlatform[];
  readonly dataRegion: string;
  readonly privacyNoticeVersion: string;
  readonly isEnabled: boolean;
}

/**
 * Countries seeded into CountrySettings. A new market is a new entry here plus translations
 * and a legal review (International expansion), not new code.
 */
export const COUNTRY_SETTINGS: readonly CountrySettingsDefinition[] = [
  {
    code: 'IN',
    currencyCode: 'INR',
    numberFormat: 'INDIAN',
    defaultLocale: 'en',
    supportedLocales: ['en', 'hi'],
    defaultTimezone: 'Asia/Kolkata',
    enabledPlatforms: ['YOUTUBE', 'INSTAGRAM'],
    dataRegion: 'ap-south-1',
    privacyNoticeVersion: '2026-10-v1',
    isEnabled: true,
  },
];
