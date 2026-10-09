import { useLocale, useTranslations } from 'next-intl';
import { SUPPORTED_LOCALES } from '@/config/locales';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** Links to the current page in each supported language. */
export function LanguageSwitcher() {
  const t = useTranslations('common');
  const currentLocale = useLocale();
  return (
    <nav aria-label={t('language')} className="flex gap-3 text-sm">
      {SUPPORTED_LOCALES.map((locale) => (
        <Link
          key={locale}
          href="/"
          locale={locale}
          lang={locale}
          aria-current={locale === currentLocale ? 'true' : undefined}
          className={cn(
            'rounded px-1 underline-offset-4 hover:underline',
            locale === currentLocale && 'font-semibold',
          )}
        >
          {t(`languageNames.${locale}`)}
        </Link>
      ))}
    </nav>
  );
}
