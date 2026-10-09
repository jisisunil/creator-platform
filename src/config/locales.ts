/** Interface languages with translation files in src/i18n (NFR-7). */
export const SUPPORTED_LOCALES = ['en', 'hi'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * Display timezone for visitors before we know their country. Signed-in users get their
 * own timezone; country values otherwise come from CountrySettings (CLAUDE.md §9).
 */
export const FALLBACK_DISPLAY_TIMEZONE = 'Asia/Kolkata';
