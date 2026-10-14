import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { getOwnProfile, profileChecklist } from '@/services/creators';
import { findBrandMembership } from '@/services/team';

/** Landing page after sign-in: the creator checklist, or each role's home. */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale);
  const t = await getTranslations('dashboard');
  const title = t('welcome', { name: session.user.name });
  const container = getContainer();

  if (session.user.role === 'BRAND') {
    const tNav = await getTranslations('nav');
    const membership = await findBrandMembership(container, session.user.id);
    return (
      <PageShell title={title}>
        <p>
          {membership ? t('brandIntro', { brandName: membership.brandName }) : t('brandNoTeam')}
        </p>
        {membership ? (
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/brand/search">{tNav('search')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/brand/shortlists">{tNav('shortlists')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/brand/saved-searches">{tNav('savedSearches')}</Link>
            </Button>
          </div>
        ) : null}
      </PageShell>
    );
  }
  if (session.user.role === 'ADMIN') {
    return (
      <PageShell title={title}>
        <p>{t('adminIntro')}</p>
      </PageShell>
    );
  }

  const tCreator = await getTranslations('creator.home');
  const profile = await getOwnProfile(container, session.user);
  const checklist = profileChecklist(profile);
  return (
    <PageShell title={title} intro={tCreator('intro')}>
      <Card>
        <CardTitle>
          {tCreator('completeness', { percent: checklist.completenessPercent })}
        </CardTitle>
        <p className="mt-2 text-sm">
          {profile.isSearchable ? tCreator('searchVisible') : tCreator('searchHidden')}
        </p>
        {checklist.missing.length === 0 ? (
          <p className="mt-3 text-sm">{tCreator('allDone')}</p>
        ) : (
          <>
            <h3 className="mt-4 text-sm font-medium">{tCreator('todo')}</h3>
            <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm">
              {checklist.missing.map((field) => (
                <li key={field}>
                  <Link
                    href={field === 'connectedAccount' ? '/creator/accounts' : '/creator/profile'}
                    className="underline"
                  >
                    {tCreator(`missing.${field}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/creator/profile">{tCreator('editProfile')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/creator/accounts">{tCreator('manageAccounts')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/creator/analytics">{tCreator('viewAnalytics')}</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href={`/c/${profile.slug}`}>{tCreator('viewPublic')}</Link>
        </Button>
      </div>
    </PageShell>
  );
}
