import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/** Footer with the privacy notice, terms and grievance contact on every page (PR-1, PR-10). */
export async function SiteFooter() {
  const t = await getTranslations('nav');
  return (
    <footer className="mt-16 border-t">
      <nav
        aria-label={t('privacy')}
        className="text-muted-foreground mx-auto flex max-w-5xl flex-wrap gap-4 px-4 py-6 text-sm"
      >
        <Link href="/privacy" className="underline-offset-4 hover:underline">
          {t('privacy')}
        </Link>
        <Link href="/terms" className="underline-offset-4 hover:underline">
          {t('terms')}
        </Link>
        <Link href="/grievance" className="underline-offset-4 hover:underline">
          {t('grievance')}
        </Link>
      </nav>
    </footer>
  );
}
