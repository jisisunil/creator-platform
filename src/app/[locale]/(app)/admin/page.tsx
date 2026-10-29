import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { FreeBetaForm } from '@/components/admin/AdminForms';
import { AdminNav } from '@/components/admin/AdminNav';
import { PageShell } from '@/components/layout/PageShell';
import { Card, CardTitle } from '@/components/ui/card';
import { SUCCESS_TARGETS } from '@/config/success-metrics';
import { requirePageSession } from '@/lib/auth/current-session';
import { formatCount } from '@/lib/format';
import { getFreeBetaSetting, getPlatformMetrics } from '@/services/admin';

/** FR-13.4: platform figures for the last 30 days, open queues and platform switches. */
export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['ADMIN'] });
  const t = await getTranslations('admin.overview');
  const container = getContainer();
  const [metrics, isFreeBetaActive] = await Promise.all([
    getPlatformMetrics(container, session.user.id),
    getFreeBetaSetting(container, session.user.id),
  ]);
  const count = (value: number) => formatCount(value, locale, session.user.countryCode);
  const figures = [
    ['signUps', metrics.signUps],
    ['activeUsers', metrics.activeUsers],
    ['requestsSent', metrics.requestsSent],
    ['dealsCompleted', metrics.dealsCompleted],
    ['creators', metrics.creators],
    ['brands', metrics.brands],
    ['openReports', metrics.openReports],
    ['openFlags', metrics.openFlags],
    ['openDisputes', metrics.openDisputes],
  ] as const;
  // The spec's phase 2 gate: live figure next to its target.
  const goals = [
    ['verifiedCreators', count(metrics.verifiedCreators), count(SUCCESS_TARGETS.verifiedCreators)],
    ['activeBrands', count(metrics.activeBrands), count(SUCCESS_TARGETS.activeBrands)],
    ['requestsSent', count(metrics.requestsSent), count(SUCCESS_TARGETS.requestsSent)],
    [
      'acceptanceRate',
      metrics.acceptanceRatePercent === null
        ? t('goals.noOutcomesYet')
        : t('goals.percent', { value: metrics.acceptanceRatePercent }),
      t('goals.percent', { value: SUCCESS_TARGETS.acceptanceRatePercent }),
    ],
    ['dealsCompleted', count(metrics.dealsCompleted), count(SUCCESS_TARGETS.dealsCompleted)],
  ] as const;

  return (
    <PageShell title={t('title')} intro={<AdminNav />} wide>
      <Card className="grid gap-3">
        <CardTitle>{t('metricsTitle', { days: metrics.windowDays })}</CardTitle>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {figures.map(([key, value]) => (
            <div key={key}>
              <dt className="text-muted-foreground text-sm">{t(`metrics.${key}`)}</dt>
              <dd className="text-2xl font-semibold">{count(value)}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="grid gap-3">
        <CardTitle>{t('goalsTitle')}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {t('goalsIntro', { days: metrics.windowDays })}
        </p>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {goals.map(([key, value, target]) => (
            <div key={key}>
              <dt className="text-muted-foreground text-sm">{t(`goals.${key}`)}</dt>
              <dd className="text-2xl font-semibold">{value}</dd>
              <dd className="text-muted-foreground text-xs">{t('goals.target', { target })}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="grid gap-3">
        <CardTitle>{t('betaTitle')}</CardTitle>
        <FreeBetaForm isActive={isFreeBetaActive} />
      </Card>
    </PageShell>
  );
}
