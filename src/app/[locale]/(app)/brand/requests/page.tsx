import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { Pagination } from '@/components/layout/Pagination';
import { PageShell } from '@/components/layout/PageShell';
import { RequestList } from '@/components/requests/RequestDisplay';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { pageNumberFrom } from '@/lib/validation/page-number';
import { listBrandRequests } from '@/services/requests';
import { findBrandMembership } from '@/services/team';

/** UC-R1: requests the brand has sent, newest first. */
export default async function BrandRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND'] });
  const t = await getTranslations('requests');
  const container = getContainer();
  if (!(await findBrandMembership(container, session.user.id))) {
    const tDashboard = await getTranslations('dashboard');
    return (
      <PageShell title={t('brandTitle')}>
        <Alert>{tDashboard('brandNoTeam')}</Alert>
      </PageShell>
    );
  }
  const result = await listBrandRequests(container, {
    userId: session.user.id,
    page: pageNumberFrom((await searchParams).page),
  });

  return (
    <PageShell title={t('brandTitle')} intro={t('brandIntro')}>
      {result.items.length === 0 ? (
        <Card className="grid gap-3">
          <p className="text-muted-foreground text-sm">{t('brandEmpty')}</p>
          <Button asChild className="w-fit">
            <Link href="/brand/search">{t('findCreators')}</Link>
          </Button>
        </Card>
      ) : (
        <RequestList items={result.items} basePath="/brand/requests" showCreator />
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        hrefFor={(page) => `/brand/requests?page=${page}`}
      />
    </PageShell>
  );
}
