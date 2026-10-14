import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { CreateShortlistForm } from '@/components/brand/DiscoveryForms';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { Card, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { listShortlists } from '@/services/shortlists';
import { findBrandMembership } from '@/services/team';

/** FR-6.1: the brand's shortlists the user can see, and a form to create one. */
export default async function ShortlistsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND'] });
  const t = await getTranslations('brand.shortlists');
  const container = getContainer();
  if (!(await findBrandMembership(container, session.user.id))) {
    const tDashboard = await getTranslations('dashboard');
    return (
      <PageShell title={t('title')}>
        <Alert>{tDashboard('brandNoTeam')}</Alert>
      </PageShell>
    );
  }
  const shortlists = await listShortlists(container, session.user.id);
  const format = await getFormatter();

  return (
    <PageShell title={t('title')}>
      <Card>
        {shortlists.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        ) : (
          <ul className="grid gap-3">
            {shortlists.map((shortlist) => (
              <li key={shortlist.id} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link
                    href={`/brand/shortlists/${shortlist.id}`}
                    className="font-medium underline"
                  >
                    {shortlist.name}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {t('itemCount', { count: shortlist.itemCount })} ·{' '}
                    {shortlist.isSharedWithTeam ? t('shared') : t('private')} ·{' '}
                    {t('by', { name: shortlist.createdByName })} ·{' '}
                    {format.dateTime(shortlist.updatedAt, { dateStyle: 'medium' })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardTitle>{t('createTitle')}</CardTitle>
        <div className="mt-4">
          <CreateShortlistForm />
        </div>
      </Card>
    </PageShell>
  );
}
