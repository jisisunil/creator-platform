import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/** Footer with the privacy notice, terms and grievance contact on every page (PR-1, PR-10). */
export async function SiteFooter() {
  const t = await getTranslations('nav');
  const tMeta = await getTranslations('metadata');
  return (
    <footer className="mt-24 border-t print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-4 px-4 py-10">
        <p className="font-serif text-xl">
          {tMeta('title')}
          <span aria-hidden="true" className="text-brand">
            .
          </span>
        </p>
        <nav
          aria-label={t('privacy')}
          className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-2 text-sm"
        >
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            {t('privacy')}
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            {t('terms')}
          </Link>
          <Link href="/grievance" className="hover:text-foreground transition-colors">
            {t('grievance')}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
