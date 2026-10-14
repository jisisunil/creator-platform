import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { AddToShortlistForm } from '@/components/brand/DiscoveryForms';
import { CreatorProfileView } from '@/components/creators/CreatorProfileView';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { isDomainError } from '@/domain/errors';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { viewCreatorProfile } from '@/services/discovery';
import { getCreatorReputation } from '@/services/ratings';
import { listShortlists } from '@/services/shortlists';

/**
 * UC-D2: a creator profile opened from search. The view is recorded and counted against
 * the plan's hourly limit (SEC-3); unavailable creators show "profile unavailable".
 */
export default async function BrandCreatorProfilePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND'] });
  const container = getContainer();
  const t = await getTranslations('publicProfile');

  let profile;
  try {
    profile = await viewCreatorProfile(container, { userId: session.user.id, slug });
  } catch (error) {
    if (!isDomainError(error)) throw error;
    const tSearch = await getTranslations('brand.search');
    const tDashboard = await getTranslations('dashboard');
    return (
      <PageShell title={t('unavailable')}>
        <Alert variant="destructive">
          {error.code === 'RATE_LIMITED' ? tSearch('viewLimit') : tDashboard('brandNoTeam')}
        </Alert>
      </PageShell>
    );
  }
  if (!profile) {
    return (
      <PageShell title={t('unavailable')}>
        <p>{t('unavailableText')}</p>
      </PageShell>
    );
  }

  const tShortlists = await getTranslations('brand.shortlists');
  const tRequests = await getTranslations('requests.new');
  const shortlists = (await listShortlists(container, session.user.id)).map(({ id, name }) => ({
    id,
    name,
  }));
  return (
    <CreatorProfileView
      profile={profile}
      locale={locale}
      reputation={await getCreatorReputation(container, profile.id)}
      actions={
        <>
          <Card className="grid gap-3">
            <CardTitle>{tRequests('cardTitle')}</CardTitle>
            {profile.isOpenToCollaborations ? (
              <Button asChild className="w-fit">
                <Link href={`/brand/requests/new?creator=${profile.slug}`}>
                  {tRequests('start')}
                </Link>
              </Button>
            ) : (
              <p className="text-muted-foreground text-sm">{tRequests('notOpen')}</p>
            )}
          </Card>
          <Card>
            <CardTitle>{tShortlists('addTo')}</CardTitle>
            <div className="mt-3">
              <AddToShortlistForm creatorId={profile.id} shortlists={shortlists} />
            </div>
          </Card>
        </>
      }
    />
  );
}
