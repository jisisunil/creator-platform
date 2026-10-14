import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { DeleteSavedSearchButton } from '@/components/brand/DiscoveryForms';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { parseSavedFilters, toSearchQuery } from '@/lib/validation/search-schemas';
import { listSavedSearches, loadSavedSearch } from '@/services/discovery';
import { findBrandMembership } from '@/services/team';

/** FR-5.4 / UC-D5: saved searches; running one drops filter values that no longer exist. */
export default async function SavedSearchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND'] });
  const t = await getTranslations('brand.savedSearches');
  const container = getContainer();
  if (!(await findBrandMembership(container, session.user.id))) {
    const tDashboard = await getTranslations('dashboard');
    return (
      <PageShell title={t('title')}>
        <Alert>{tDashboard('brandNoTeam')}</Alert>
      </PageShell>
    );
  }

  const { run } = await searchParams;
  const ran = run
    ? await loadSavedSearch(
        container,
        { userId: session.user.id, savedSearchId: run },
        parseSavedFilters,
      ).catch(() => null)
    : null;
  const saved = await listSavedSearches(container, session.user.id);
  const format = await getFormatter();

  return (
    <PageShell title={t('title')}>
      {ran?.hasDroppedValues ? (
        <Alert>
          {t('droppedValues')}{' '}
          <Link href={`/brand/search?${toSearchQuery(ran.filters)}`} className="underline">
            {t('run')}
          </Link>
        </Alert>
      ) : null}
      <Card>
        {saved.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        ) : (
          <ul className="grid gap-3">
            {saved.map((search) => (
              <li key={search.id} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{search.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {format.dateTime(search.createdAt, { dateStyle: 'medium' })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/brand/search?${toSearchQuery(parseSavedFilters(search.filters))}`}
                    className="text-sm underline"
                  >
                    {t('run')}
                  </Link>
                  <DeleteSavedSearchButton savedSearchId={search.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
