'use client';

import { useLocale, useTranslations } from 'next-intl';
import { SUPPORTED_LOCALES } from '@/config/locales';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** Links to the current page in each supported language. */
export function LanguageSwitcher() {
  const t = useTranslations('common');
  const currentLocale = useLocale();
  const pathname = usePathname();
  return (
    <nav aria-label={t('language')} className="flex gap-3 text-sm">
      {SUPPORTED_LOCALES.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          lang={locale}
          aria-current={locale === currentLocale ? 'true' : undefined}
          className={cn(
            // The phone's own font: the bundled Devanagari font (~120 KB) would otherwise
            // download on every English page just for "हिन्दी" (NFR-6).
            'font-system rounded px-1 underline-offset-4 hover:underline',
            locale === currentLocale && 'font-semibold',
          )}
        >
          {t(`languageNames.${locale}`)}
        </Link>
      ))}
    </nav>
  );
}
