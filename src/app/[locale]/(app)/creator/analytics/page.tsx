import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { AppealFlagForm } from '@/components/creators/AppealFlagForm';
import { FollowersChart, type FollowerSeries } from '@/components/creators/FollowersChart';
import { ScoreBreakdown } from '@/components/creators/ScoreBreakdown';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { Card, CardTitle } from '@/components/ui/card';
import { MIN_HISTORY_DAYS } from '@/config/score';
import { requirePageSession } from '@/lib/auth/current-session';
import { formatCount } from '@/lib/format';
import { getCreatorAnalytics } from '@/services/creators';
import { getOwnFlags } from '@/services/moderation';

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** UC-C7: growth charts and the score breakdown. */
export default async function CreatorAnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['CREATOR'] });
  const analytics = await getCreatorAnalytics(getContainer(), session.user.id);
  const flags = await getOwnFlags(getContainer(), session.user.id);
  const tFlags = await getTranslations('creator.analytics.flags');
  const tScore = await getTranslations('score');
  const t = await getTranslations('creator.analytics');
  const tPlatforms = await getTranslations('platforms');

  const series: FollowerSeries[] = analytics.series.map((account) => ({
    id: account.id,
    label: `${tPlatforms(account.platform)} ${account.handle}`,
    platform: account.platform,
    points: account.snapshots.map((snapshot) => ({
      day: isoDay(snapshot.capturedOn),
      followers: snapshot.followers,
    })),
  }));
  const hasEnoughData = series.some((entry) => entry.points.length >= MIN_HISTORY_DAYS);
  const days = [...new Set(series.flatMap((entry) => entry.points.map((p) => p.day)))].sort();
  const country = analytics.profile.countryCode;

  return (
    <PageShell title={t('title')} intro={t('profileViews', { count: analytics.profileViews30d })}>
      <Card>
        <CardTitle>{t('followersTitle')}</CardTitle>
        <div className="mt-4">
          {hasEnoughData ? (
            <>
              <FollowersChart series={series} />
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer">{t('tableCaption')}</summary>
                <div className="mt-2 max-h-72 overflow-auto">
                  <table className="w-full text-left tabular-nums">
                    <caption className="sr-only">{t('tableCaption')}</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="py-1 pr-4">
                          {t('date')}
                        </th>
                        {series.map((entry) => (
                          <th key={entry.id} scope="col" className="py-1 pr-4">
                            {entry.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...days].reverse().map((day) => (
                        <tr key={day} className="border-t">
                          <th scope="row" className="py-1 pr-4 font-normal">
                            {day}
                          </th>
                          {series.map((entry) => {
                            const point = entry.points.find((p) => p.day === day);
                            return (
                              <td key={entry.id} className="py-1 pr-4">
                                {point ? formatCount(point.followers, locale, country) : '–'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          ) : (
            <Alert>{t('needMoreData')}</Alert>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>{t('scoreTitle')}</CardTitle>
        <div className="mt-4">
          {analytics.score ? (
            <ScoreBreakdown
              score={analytics.score.score}
              components={analytics.score.components}
              weightsVersion={analytics.score.weightsVersion}
            />
          ) : (
            <p className="text-muted-foreground text-sm">{t('noScore')}</p>
          )}
        </div>
      </Card>
      {flags.length > 0 ? (
        <Card className="grid gap-4">
          <CardTitle>{tFlags('title')}</CardTitle>
          <p className="text-muted-foreground text-sm">{tFlags('intro')}</p>
          <ul className="grid gap-4">
            {flags.map((flag) => (
              <li key={flag.id} className="grid gap-2 text-sm">
                <p>
                  <span className="font-medium">{tScore(`flags.${flag.type}`)}</span> ·{' '}
                  {flag.status === 'SUSPICIOUS' ? tFlags('suspicious') : tFlags('underReview')}
                </p>
                {flag.status === 'SUSPICIOUS' ? <AppealFlagForm flagId={flag.id} /> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </PageShell>
  );
}
