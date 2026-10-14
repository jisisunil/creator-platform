import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import hi from '@/i18n/hi.json';
import { CATEGORIES_BY_ROLE, NOTIFICATION_KINDS } from '@/services/notifications';

describe('notification texts (FR-12, NFR-7)', () => {
  for (const [locale, messages] of [
    ['en', en],
    ['hi', hi],
  ] as const) {
    it(`has an in-app text for every notification kind in ${locale}`, () => {
      const kinds = messages.notifications.kinds as Record<string, string>;

      for (const kind of NOTIFICATION_KINDS) expect(kinds[kind], kind).toBeTruthy();
    });

    it(`names every preference category in ${locale}`, () => {
      const categories = messages.settings.notifications.categories as Record<string, string>;
      const all = new Set([...CATEGORIES_BY_ROLE.CREATOR, ...CATEGORIES_BY_ROLE.BRAND]);

      for (const category of all) expect(categories[category], category).toBeTruthy();
    });
  }
});
