import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { AllowanceSummary, contactBlockedReason } from '@/components/plans/AllowanceSummary';
import { PlanLimitAlert } from '@/components/plans/PlanLimitAlert';
import { Alert } from '@/components/ui/alert';
import { Card, CardTitle } from '@/components/ui/card';
import { getServerEnv } from '@/config/env';
import { requirePageSession } from '@/lib/auth/current-session';
import { formatMoney } from '@/lib/format';
import { getPlanOverview, type PlanRecord } from '@/services/plans';
import { findBrandMembership } from '@/services/team';

const FEATURES = ['canSaveSearch', 'canCompare', 'canCampaignReports', 'canCsvExport'] as const;

/**
 * FR-11.1 / FR-11.2: the brand's plan, its limits and use, and the upgrade options. Plan
 * changes and credit packs go through sales until online payments exist (FR-11.4, later).
 */
export default async function PlanPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND'] });
  const t = await getTranslations('plans');
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
  const overview = await getPlanOverview(container, session.user.id);
  const countryCode = session.user.countryCode;
  const salesEmail = getServerEnv().SALES_EMAIL;
  const mailto = (subject: string) =>
    `mailto:${salesEmail}?subject=${encodeURIComponent(`${subject}: ${overview.brandName}`)}`;
  const price = (plan: PlanRecord) => {
    if (plan.usesCreditPacks) return t('price.perPack');
    if (plan.priceMinor === 0) return t('price.free');
    const amount = formatMoney(plan.priceMinor, plan.currencyCode, locale, countryCode);
    return plan.billingPeriod === 'MONTHLY' ? t('price.perMonth', { amount }) : amount;
  };
  const requestsLine = (plan: PlanRecord) =>
    plan.usesCreditPacks
      ? t('limits.creditRequests')
      : plan.billingPeriod === 'MONTHLY'
        ? t('limits.requestsPerMonth', { count: plan.contactRequestsPerPeriod })
        : t('limits.requestsTotal', { count: plan.contactRequestsPerPeriod });
  const blockedReason = contactBlockedReason(overview.allowance);

  return (
    <PageShell title={t('title')} intro={t('intro')}>
      {blockedReason ? <PlanLimitAlert reasonKey={blockedReason} /> : null}

      <Card className="grid gap-3">
        <CardTitle>{t('current', { name: t(`names.${overview.plan.code}`) })}</CardTitle>
        <p className="text-sm">{price(overview.plan)}</p>
        {overview.trialEndsAt ? (
          <p className="text-sm">
            {t('trialEnds', {
              date: format.dateTime(overview.trialEndsAt, { dateStyle: 'medium' }),
            })}
          </p>
        ) : null}
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-medium">{t('usage.requests')}</dt>
            <dd>
              <AllowanceSummary allowance={overview.allowance} />
            </dd>
          </div>
          <div>
            <dt className="font-medium">{t('usage.seats')}</dt>
            <dd>
              {t('usage.ofLimit', { used: overview.seats.used, limit: overview.seats.limit })}
            </dd>
          </div>
          <div>
            <dt className="font-medium">{t('usage.shortlists')}</dt>
            <dd>
              {t('usage.ofLimit', {
                used: overview.shortlists.used,
                limit: overview.shortlists.limit,
              })}
            </dd>
          </div>
        </dl>
        <ul className="grid gap-1 text-sm">
          {FEATURES.map((feature) => (
            <li key={feature}>
              {overview.plan[feature] ? t('included') : t('notIncluded')}:{' '}
              {t(`features.${feature}`)}
            </li>
          ))}
        </ul>
      </Card>

      {overview.creditPacks.length > 0 ? (
        <Card className="grid gap-3">
          <CardTitle>{t('packs.title')}</CardTitle>
          <ul className="grid gap-1 text-sm">
            {overview.creditPacks.map((pack) => (
              <li key={pack.id}>
                {t('packs.line', {
                  left: pack.credits - pack.creditsUsed,
                  credits: pack.credits,
                  date: format.dateTime(pack.expiresAt, { dateStyle: 'medium' }),
                })}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section className="grid gap-4" aria-labelledby="upgrade-options">
        <h2 id="upgrade-options" className="text-lg font-semibold">
          {t('options.title')}
        </h2>
        <p className="text-sm">
          {t('options.howToChange')}{' '}
          <a href={mailto(t('options.changeSubject'))} className="underline">
            {salesEmail}
          </a>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {overview.upgradeOptions.map((plan) => (
            <Card key={plan.id} className="grid gap-2 p-4">
              <h3 className="font-semibold">{t(`names.${plan.code}`)}</h3>
              <p className="text-sm">{price(plan)}</p>
              <ul className="text-muted-foreground grid gap-1 text-sm">
                <li>{requestsLine(plan)}</li>
                <li>{t('limits.seats', { count: plan.seatLimit })}</li>
                <li>{t('limits.shortlists', { count: plan.shortlistLimit })}</li>
                {FEATURES.filter((feature) => plan[feature]).map((feature) => (
                  <li key={feature}>{t(`features.${feature}`)}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <Card className="grid gap-2 p-4">
          <h3 className="font-semibold">{t('packs.buyTitle')}</h3>
          <ul className="grid gap-1 text-sm">
            {overview.creditPackOptions.map((pack) => (
              <li key={pack.code}>
                {t('packs.option', {
                  credits: pack.credits,
                  price: formatMoney(pack.priceMinor, pack.currencyCode, locale, countryCode),
                  days: pack.validDays,
                })}
              </li>
            ))}
          </ul>
          <a href={mailto(t('packs.buySubject'))} className="text-sm underline">
            {t('packs.buy')}
          </a>
        </Card>
      </section>
    </PageShell>
  );
}
