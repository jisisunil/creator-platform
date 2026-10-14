import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { DealPosts, DealStatusBadge } from '@/components/deals/DealDisplay';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { Card, CardTitle } from '@/components/ui/card';
import { isDomainError } from '@/domain/errors';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { basisPointsToPercent, formatCount, formatMoney } from '@/lib/format';
import { type CampaignReport, getCampaignReport } from '@/services/campaigns';

/**
 * FR-9.3 / UC-R6: a campaign's deals and posts, with totals for plans that include
 * campaign reports. Figures are a table of numbers, not a chart: the brand needs exact
 * values (views, cost) to compare and share.
 */
export default async function CampaignReportPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND'] });
  const t = await getTranslations('campaigns.report');
  const countryCode = session.user.countryCode;

  let report: CampaignReport;
  try {
    report = await getCampaignReport(getContainer(), { userId: session.user.id, campaignId: id });
  } catch (error) {
    // SEC-2: another brand's campaign looks like it doesn't exist.
    if (isDomainError(error) && (error.code === 'NOT_FOUND' || error.code === 'NOT_ALLOWED')) {
      notFound();
    }
    throw error;
  }
  const totals = report.totals;
  const count = (value: number) => formatCount(value, locale, countryCode);
  const moneyIn = (amountMinor: number) =>
    formatMoney(amountMinor, report.currencyCode, locale, countryCode);

  return (
    <PageShell title={report.name} intro={t('intro')} wide>
      {totals ? (
        <Card className="grid gap-3">
          <CardTitle>{t('totalsTitle')}</CardTitle>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            {(
              [
                [t('deals'), count(totals.dealCount)],
                [t('posts'), count(totals.postCount)],
                [t('views'), totals.views === null ? t('notAvailable') : count(totals.views)],
                [t('likes'), count(totals.likes)],
                [t('comments'), count(totals.comments)],
                [
                  t('engagement'),
                  totals.engagementRateBp === null
                    ? t('notAvailable')
                    : `${basisPointsToPercent(totals.engagementRateBp)}%`,
                ],
                [t('spend'), moneyIn(totals.spendMinor)],
                [
                  t('costPerThousandViews'),
                  totals.costPerThousandViewsMinor === null
                    ? t('notAvailable')
                    : moneyIn(totals.costPerThousandViewsMinor),
                ],
                [
                  t('costPerEngagement'),
                  totals.costPerEngagementMinor === null
                    ? t('notAvailable')
                    : moneyIn(totals.costPerEngagementMinor),
                ],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground text-xs">{t('costNote')}</p>
        </Card>
      ) : (
        <Alert>{t('upgrade')}</Alert>
      )}

      {report.deals.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm">{t('noDeals')}</p>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {report.deals.map((deal) => (
            <li key={deal.id}>
              <Card className="grid gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/deals/${deal.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {deal.creatorDisplayName}
                  </Link>
                  <DealStatusBadge status={deal.status} />
                </div>
                {deal.agreedAmountMinor === null ? null : (
                  <p className="text-sm">{moneyIn(deal.agreedAmountMinor)}</p>
                )}
                <DealPosts posts={deal.posts} locale={locale} countryCode={countryCode} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
