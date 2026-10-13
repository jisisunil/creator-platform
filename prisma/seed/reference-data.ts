import type { DatabaseClient } from '@/adapters/db/client';
import { CATEGORY_SLUGS_BY_COUNTRY } from '@/config/categories';
import { COUNTRY_SETTINGS } from '@/config/countries';
import { CONTENT_LANGUAGES } from '@/config/languages';
import { PLAN_DEFINITIONS } from '@/config/plans';
import { PLATFORM_SETTING_DEFAULTS } from '@/config/platform-settings';

const PRIVACY_NOTICE_PUBLISHED_AT = new Date('2026-10-09T00:00:00Z');

/** Upserts countries, languages, categories, plans and settings. Safe to run repeatedly. */
export async function seedReferenceData(db: DatabaseClient): Promise<void> {
  for (const country of COUNTRY_SETTINGS) {
    const data = {
      ...country,
      supportedLocales: [...country.supportedLocales],
      enabledPlatforms: [...country.enabledPlatforms],
    };
    await db.countrySettings.upsert({ where: { code: country.code }, create: data, update: data });
  }

  // PR-3: the first published notice per country. Later versions are added by migration
  // or admin tooling, with isMaterialChange set when users must agree again.
  for (const country of COUNTRY_SETTINGS) {
    await db.privacyNotice.upsert({
      where: {
        countryCode_version: { countryCode: country.code, version: country.privacyNoticeVersion },
      },
      create: {
        countryCode: country.code,
        version: country.privacyNoticeVersion,
        publishedAt: PRIVACY_NOTICE_PUBLISHED_AT,
        isMaterialChange: false,
      },
      update: {},
    });
  }

  for (const [index, language] of CONTENT_LANGUAGES.entries()) {
    const data = { ...language, sortOrder: index };
    await db.language.upsert({ where: { code: language.code }, create: data, update: data });
  }

  for (const [countryCode, slugs] of Object.entries(CATEGORY_SLUGS_BY_COUNTRY)) {
    for (const [index, slug] of slugs.entries()) {
      await db.category.upsert({
        where: { countryCode_slug: { countryCode, slug } },
        create: { countryCode, slug, sortOrder: index },
        update: { sortOrder: index, isActive: true },
      });
    }
  }

  for (const plan of PLAN_DEFINITIONS) {
    await db.plan.upsert({
      where: { code_countryCode: { code: plan.code, countryCode: plan.countryCode } },
      create: plan,
      update: plan,
    });
  }

  for (const [key, value] of Object.entries(PLATFORM_SETTING_DEFAULTS)) {
    // Never overwrite a value an admin has changed.
    await db.platformSetting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
}
