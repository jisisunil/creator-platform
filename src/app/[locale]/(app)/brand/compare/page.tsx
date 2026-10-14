import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Fragment } from 'react';
import { LAUNCH_COUNTRY_CODE } from '@/config/countries';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { PlanLimitAlert } from '@/components/plans/PlanLimitAlert';
import { Alert } from '@/components/ui/alert';
import { isDomainError } from '@/domain/errors';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { basisPointsToPercent, formatCompactCount } from '@/lib/format';
import { compareCreators, type CreatorComparison } from '@/services/discovery';

const PLATFORMS = ['YOUTUBE', 'INSTAGRAM'] as const;
const PERMILLE_PER_PERCENT = 10;

/** FR-6.2 / UC-D4: 2–4 creators side by side, per platform, audience "not shared" when missing. */
export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND'] });
  const t = await getTranslations('brand.compare');
  const { ids } = await searchParams;
  const creatorIds = (Array.isArray(ids) ? ids : ids ? [ids] : []).slice(0, 10);

  let rows: CreatorComparison[];
  try {
    rows = await compareCreators(getContainer(), { userId: session.user.id, creatorIds });
  } catch (error) {
    if (!isDomainError(error)) throw error;
    return (
      <PageShell title={t('title')}>
        {error.code === 'PLAN_LIMIT_REACHED' ? (
          <PlanLimitAlert reasonKey={error.fieldErrors?.plan} />
        ) : (
          <Alert>{t('needTwo')}</Alert>
        )}
      </PageShell>
    );
  }
  if (rows.length < 2) {
    return (
      <PageShell title={t('title')}>
        <Alert>{t('needTwo')}</Alert>
      </PageShell>
    );
  }

  const tPlatforms = await getTranslations('platforms');
  const tTiers = await getTranslations('tiers');
  const tRegions = await getTranslations('regions');
  const tProfile = await getTranslations('publicProfile');
  const count = (value: number, country: string) => formatCompactCount(value, locale, country);

  const metricRow = (label: string, cells: readonly string[]) => (
    <tr className="border-t">
      <th scope="row" className="py-2 pr-4 text-left font-medium">
        {label}
      </th>
      {cells.map((cell, index) => (
        <td key={rows[index]?.creator.id ?? index} className="py-2 pr-4 tabular-nums">
          {cell}
        </td>
      ))}
    </tr>
  );

  return (
    <PageShell wide title={t('title')}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">{t('title')}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-4 text-left">
                {t('metric')}
              </th>
              {rows.map(({ creator }) => (
                <th key={creator.id} scope="col" className="py-2 pr-4 text-left">
                  <Link href={`/brand/creators/${creator.slug}`} className="underline">
                    {creator.displayName}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricRow(
              t('location'),
              rows.map(({ creator }) =>
                [
                  creator.city,
                  creator.stateCode ? tRegions(`${creator.countryCode}.${creator.stateCode}`) : '',
                ]
                  .filter(Boolean)
                  .join(', '),
              ),
            )}
            {metricRow(
              t('tier'),
              rows.map(({ creator }) => (creator.tier ? tTiers(creator.tier) : '–')),
            )}
            {metricRow(
              t('score'),
              rows.map(({ creator }) => String(creator.currentScore ?? '–')),
            )}
            {metricRow(
              t('engagement'),
              rows.map(({ creator }) => `${basisPointsToPercent(creator.engagementRateBp)}%`),
            )}
            {PLATFORMS.map((platform) => platformRows(platform, tPlatforms(platform)))}
            {metricRow(
              t('audience'),
              rows.map(({ audience }) => {
                const women = audience.find(
                  (row) => row.dimension === 'GENDER' && row.bucket === 'F',
                );
                return women
                  ? `${tProfile('gender.F')} ${(women.sharePermille / PERMILLE_PER_PERCENT).toFixed(0)}%`
                  : t('notShared');
              }),
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  );

  // UC-D4: figures for different platforms are shown separately, never mixed.
  function platformRows(platform: (typeof PLATFORMS)[number], label: string) {
    const perCreator = rows.map((row) =>
      row.platforms.find((entry) => entry.platform === platform),
    );
    if (perCreator.every((entry) => entry === undefined)) return null;
    return (
      <Fragment key={platform}>
        {metricRow(
          `${label}: ${t('followers')}`,
          perCreator.map((entry, index) =>
            !entry
              ? t('notOnPlatform')
              : entry.followers === null
                ? t('hidden')
                : count(entry.followers, rows[index]?.creator.countryCode ?? LAUNCH_COUNTRY_CODE),
          ),
        )}
        {metricRow(
          `${label}: ${t('posts')}`,
          perCreator.map((entry) => (entry ? String(entry.postsLast30Days) : t('notOnPlatform'))),
        )}
        {metricRow(
          `${label}: ${t('engagement')}`,
          perCreator.map((entry) =>
            entry && entry.engagementRateBp !== null
              ? `${basisPointsToPercent(entry.engagementRateBp)}%`
              : t('notOnPlatform'),
          ),
        )}
        {platform === 'YOUTUBE'
          ? metricRow(
              `${label}: ${t('views')}`,
              perCreator.map((entry, index) =>
                entry && entry.views30d !== null
                  ? count(entry.views30d, rows[index]?.creator.countryCode ?? LAUNCH_COUNTRY_CODE)
                  : t('notOnPlatform'),
              ),
            )
          : null}
      </Fragment>
    );
  }
}
