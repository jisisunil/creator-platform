import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/** Previous / next links for a paginated list; nothing when there is one page. */
export async function Pagination({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) return null;
  const t = await getTranslations('common.pagination');
  return (
    <nav aria-label={t('label')} className="flex items-center justify-center gap-4 text-sm">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="underline">
          {t('previous')}
        </Link>
      ) : null}
      <span>{t('pageOf', { page, pageCount })}</span>
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className="underline">
          {t('next')}
        </Link>
      ) : null}
    </nav>
  );
}
