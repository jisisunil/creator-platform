import { describe, expect, it } from 'vitest';
import { CATEGORY_SLUGS_BY_COUNTRY } from '@/config/categories';
import { SUPPORTED_LOCALES } from '@/config/locales';
import en from '@/i18n/en.json';
import hi from '@/i18n/hi.json';

const MESSAGES: Record<(typeof SUPPORTED_LOCALES)[number], unknown> = { en, hi };

function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('translation files (NFR-7)', () => {
  it('every locale has exactly the same keys as English', () => {
    const englishKeys = keyPaths(en).sort();
    for (const locale of SUPPORTED_LOCALES) {
      expect(keyPaths(MESSAGES[locale]).sort(), locale).toEqual(englishKeys);
    }
  });

  it('every configured category has a translated name', () => {
    const slugs = Object.values(CATEGORY_SLUGS_BY_COUNTRY).flat();
    for (const slug of slugs) {
      expect(Object.keys(en.categories)).toContain(slug);
    }
  });

  it('every domain error code has a user-facing message', () => {
    const codes = [
      'VALIDATION_FAILED',
      'UNAUTHENTICATED',
      'NOT_ALLOWED',
      'NOT_FOUND',
      'CONFLICT',
      'INVALID_STATE',
      'RATE_LIMITED',
      'PLAN_LIMIT_REACHED',
      'REQUEST_EXPIRED',
      'NOT_AVAILABLE',
      'INTERNAL',
    ];
    expect(Object.keys(en.errors)).toEqual(expect.arrayContaining(codes));
  });
});
