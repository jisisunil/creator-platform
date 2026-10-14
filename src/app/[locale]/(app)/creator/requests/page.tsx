import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { Pagination } from '@/components/layout/Pagination';
import { PageShell } from '@/components/layout/PageShell';
import { RequestList } from '@/components/requests/RequestDisplay';
import { Card } from '@/components/ui/card';
import { requirePageSession } from '@/lib/auth/current-session';
import { pageNumberFrom } from '@/lib/validation/page-number';
import { getOwnProfile } from '@/services/creators';
import { listCreatorRequests } from '@/services/requests';

/** UC-R2: the creator's request inbox, open requests first. */
export default async function CreatorRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['CREATOR'] });
  const t = await getTranslations('requests');
  const container = getContainer();
  // Creates the profile on first visit, as the dashboard does.
  await getOwnProfile(container, session.user);
  const result = await listCreatorRequests(container, {
    userId: session.user.id,
    page: pageNumberFrom((await searchParams).page),
  });

  return (
    <PageShell title={t('creatorTitle')} intro={t('creatorIntro')}>
      {result.items.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm">{t('creatorEmpty')}</p>
        </Card>
      ) : (
        <RequestList items={result.items} basePath="/creator/requests" showCreator={false} />
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        hrefFor={(page) => `/creator/requests?page=${page}`}
      />
    </PageShell>
  );
}
