import { getFormatter, getTranslations } from 'next-intl/server';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { ScoreBreakdown } from '@/components/creators/ScoreBreakdown';
import { PageShell } from '@/components/layout/PageShell';
import { ReputationSummary } from '@/components/ratings/RatingDisplay';
import { Card, CardTitle } from '@/components/ui/card';
import { CONTENT_LANGUAGES } from '@/config/languages';
import { fileUrlFor } from '@/lib/file-url';
import { basisPointsToPercent, formatCompactCount, formatMoney } from '@/lib/format';
import type { PublicCreatorProfile } from '@/services/creators';
import type { Reputation } from '@/services/ratings';

const PERMILLE_PER_PERCENT = 10;

/**
 * FR-2.4 / UC-D2: a creator profile as brands and visitors see it. Contact details are never
 * shown (SR-12); audience data appears only as aggregates (PR-8); stale data shows when it
 * was updated. `actions` holds page-specific controls such as "add to shortlist".
 */
export async function CreatorProfileView({
  profile,
  locale,
  actions,
  reputation,
}: {
  profile: PublicCreatorProfile;
  locale: string;
  actions?: ReactNode;
  /** FR-10.2: ratings from brands the creator worked with. */
  reputation: Reputation;
}) {
  const t = await getTranslations('publicProfile');
  const tCategories = await getTranslations('categories');
  const tRegions = await getTranslations('regions');
  const tPlatforms = await getTranslations('platforms');
  const tTiers = await getTranslations('tiers');
  const tDeliverables = await getTranslations('deliverables');
  const format = await getFormatter();
  const photoUrl = fileUrlFor(profile.photoKey);
  const country = profile.countryCode;
  const location = [
    profile.city,
    profile.stateCode ? tRegions(`${country}.${profile.stateCode}`) : '',
  ]
    .filter(Boolean)
    .join(', ');
  const languageNames = profile.languageCodes.map(
    (code) => CONTENT_LANGUAGES.find((language) => language.code === code)?.nativeName ?? code,
  );
  const audienceDimensions = ['AGE', 'GENDER', 'CITY'] as const;

  return (
    <PageShell title={profile.displayName}>
      {actions}
      <Card>
        <div className="flex flex-wrap items-start gap-4">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt=""
              width={96}
              height={96}
              unoptimized
              className="size-24 rounded-full object-cover"
            />
          ) : null}
          <div className="grid gap-1">
            <p className="text-sm">
              {profile.isVerified ? (
                // Darker than the score-bar blue: white text needs 4.5:1 contrast (NFR-9).
                <span className="mr-2 rounded bg-[#1d5fb4] px-2 py-0.5 text-xs font-medium text-white">
                  ✓ {t('verified')}
                </span>
              ) : null}
              {profile.isOpenToCollaborations
                ? t('openToCollaborations')
                : t('closedToCollaborations')}
            </p>
            {location ? <p className="text-muted-foreground">{location}</p> : null}
            <p className="text-sm">
              {t('followers', {
                count: formatCompactCount(profile.totalFollowers, locale, country),
              })}
              {' · '}
              {t('engagement', { rate: basisPointsToPercent(profile.engagementRateBp) })}
              {profile.tier ? ` · ${t('tier', { tier: tTiers(profile.tier) })}` : ''}
            </p>
            {profile.lastRefreshedAt ? (
              <p className="text-muted-foreground text-xs">
                {t('lastUpdated', {
                  date: format.dateTime(profile.lastRefreshedAt, { dateStyle: 'medium' }),
                })}
              </p>
            ) : null}
          </div>
        </div>
        {profile.bio ? <p className="mt-4 whitespace-pre-line">{profile.bio}</p> : null}
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t('languages')}</dt>
            <dd>{languageNames.join(', ') || '–'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('categories')}</dt>
            <dd>{profile.categorySlugs.map((slug) => tCategories(slug)).join(', ') || '–'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('accounts')}</dt>
            <dd>
              {profile.accounts
                .map(
                  (account) =>
                    `${tPlatforms(account.platform)} ${account.handle}${account.isVerified ? ' ✓' : ''}`,
                )
                .join(', ') || '–'}
            </dd>
          </div>
        </dl>
      </Card>

      {profile.score ? (
        <Card>
          <ScoreBreakdown
            score={profile.score.value}
            components={profile.score.breakdown}
            weightsVersion={profile.score.weightsVersion}
          />
        </Card>
      ) : null}

      <Card>
        <CardTitle>{t('audience')}</CardTitle>
        {profile.audience.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">{t('audienceNotShared')}</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {audienceDimensions.map((dimension) => {
              const rows = profile.audience
                .filter((row) => row.dimension === dimension)
                .slice(0, 5);
              return (
                <div key={dimension}>
                  <h3 className="text-sm font-medium">{t(`dimension.${dimension}`)}</h3>
                  {rows.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t('audienceNotShared')}</p>
                  ) : (
                    <ul className="mt-1 grid gap-1 text-sm tabular-nums">
                      {rows.map((row) => (
                        <li key={row.bucket} className="flex justify-between gap-2">
                          <span>
                            {dimension === 'GENDER' && ['F', 'M', 'U'].includes(row.bucket)
                              ? t(`gender.${row.bucket as 'F' | 'M' | 'U'}`)
                              : row.bucket}
                          </span>
                          <span>{(row.sharePermille / PERMILLE_PER_PERCENT).toFixed(0)}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {profile.rateCard.length > 0 ? (
        <Card>
          <CardTitle>{t('rateCard')}</CardTitle>
          <ul className="mt-3 grid gap-1 text-sm">
            {profile.rateCard.map((item) => (
              <li key={item.deliverable} className="flex justify-between gap-2">
                <span>{tDeliverables(item.deliverable)}</span>
                <span className="tabular-nums">
                  {formatMoney(item.amountMinor, item.currency, locale, country)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {profile.portfolio.length > 0 ? (
        <Card>
          <CardTitle>{t('portfolio')}</CardTitle>
          <ul className="mt-3 grid gap-1 text-sm">
            {profile.portfolio.map((item) => (
              <li key={item.id}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline"
                >
                  {item.brandName}
                </a>{' '}
                <span className="text-muted-foreground">
                  {format.dateTime(item.collaboratedOn, { dateStyle: 'medium', timeZone: 'UTC' })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card>
        <ReputationSummary reputation={reputation} title={t('ratingsTitle')} />
      </Card>
    </PageShell>
  );
}
