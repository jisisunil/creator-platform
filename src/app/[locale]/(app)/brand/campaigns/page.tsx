import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { listCampaigns } from '@/services/campaigns';
import { findBrandMembership } from '@/services/team';

/** FR-9.3: the brand's campaigns; each groups the requests and deals with its name. */
export default async function CampaignsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND'] });
  const t = await getTranslations('campaigns');
  const format = await getFormatter();
  const container = getContainer();
  if (!(await findBrandMembership(container, session.user.id))) {
    const tDashboard = await getTranslations('dashboard');
    return (
      <PageShell title={t('title')}>
        <Alert>{tDashboard('brandNoTeam')}</Alert>
      </PageShell>
    );
  }
  const campaigns = await listCampaigns(container, session.user.id);

  return (
    <PageShell title={t('title')} intro={t('intro')}>
      {campaigns.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Card className="grid gap-1 p-4">
                <Link
                  href={`/brand/campaigns/${campaign.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {campaign.name}
                </Link>
                <p className="text-muted-foreground text-sm">
                  {t('counts', {
                    requests: campaign.requestCount,
                    deals: campaign.dealCount,
                    date: format.dateTime(campaign.updatedAt, { dateStyle: 'medium' }),
                  })}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
