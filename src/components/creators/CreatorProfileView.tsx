import { getFormatter, getTranslations } from 'next-intl/server';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { ScoreBreakdown } from '@/components/creators/ScoreBreakdown';
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

  const stats = [
    ['followers', formatCompactCount(profile.totalFollowers, locale, country)],
    ['engagement', `${basisPointsToPercent(profile.engagementRateBp)}%`],
    ...(profile.score ? [['score', String(profile.score.value)] as const] : []),
    ...(profile.tier ? [['tier', tTiers(profile.tier)] as const] : []),
  ] as const;
  const categoryNames = profile.categorySlugs.map((slug) => tCategories(slug));

  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-12">
      <section className="grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt=""
            width={128}
            height={128}
            unoptimized
            className="ring-border size-28 rounded-full object-cover ring-1 ring-offset-4 md:size-32"
          />
        ) : null}
        <div>
          <p className="eyebrow">{[location, ...categoryNames].filter(Boolean).join(' · ')}</p>
          <h1 className="mt-3 text-5xl leading-[1.05] sm:text-6xl">{profile.displayName}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium">
            {profile.isVerified ? (
              <span className="bg-brand-soft text-brand rounded-full px-3 py-1">
                ✓ {t('verified')}
              </span>
            ) : null}
            <span className="rounded-full border px-3 py-1">
              {profile.isOpenToCollaborations
                ? t('openToCollaborations')
                : t('closedToCollaborations')}
            </span>
            {profile.lastRefreshedAt ? (
              <span className="text-muted-foreground font-normal">
                {t('lastUpdated', {
                  date: format.dateTime(profile.lastRefreshedAt, { dateStyle: 'medium' }),
                })}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {actions ? <div className="mt-8">{actions}</div> : null}

      <dl className="mt-10 grid grid-cols-2 border-y sm:grid-cols-4">
        {stats.map(([key, value]) => (
          <div
            key={key}
            className="border-r py-6 pr-4 last:border-r-0 even:border-r-0 even:pl-4 sm:px-6 sm:first:pl-0 sm:last:border-r-0 sm:even:border-r"
          >
            <dt className="eyebrow">{t(`stats.${key}`)}</dt>
            <dd className="mt-2 font-serif text-4xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-10 grid gap-10 md:grid-cols-[1.4fr_1fr]">
        <div>
          {profile.bio ? (
            <p className="max-w-2xl text-lg leading-relaxed whitespace-pre-line">{profile.bio}</p>
          ) : null}
        </div>
        <dl className="grid content-start gap-5 text-sm">
          <div>
            <dt className="eyebrow">{t('languages')}</dt>
            <dd className="mt-1">{languageNames.join(', ') || '–'}</dd>
          </div>
          <div>
            <dt className="eyebrow">{t('accounts')}</dt>
            {profile.accounts.length === 0 ? <dd className="mt-1">–</dd> : null}
            {profile.accounts.map((account) => (
              <dd key={`${account.platform}-${account.handle}`} className="mt-1">
                {account.profileUrl ? (
                  <a
                    href={account.profileUrl}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                    className="underline underline-offset-4"
                  >
                    {tPlatforms(account.platform)} {account.handle}
                  </a>
                ) : (
                  <>
                    {tPlatforms(account.platform)} {account.handle}
                    {account.isVerified ? <span className="text-brand"> ✓</span> : null}
                  </>
                )}
                {account.isSelfReported ? (
                  <span className="text-muted-foreground text-xs">
                    {' '}
                    {account.declaredFollowers === null
                      ? t('selfReported')
                      : t('selfReportedWithFollowers', {
                          followers: formatCompactCount(account.declaredFollowers, locale, country),
                        })}
                  </span>
                ) : null}
              </dd>
            ))}
          </div>
        </dl>
      </section>

      <div className="below-fold mt-12 grid items-start gap-6 md:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-6">
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
        </div>
        <div className="grid gap-6">
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
                      {format.dateTime(item.collaboratedOn, {
                        dateStyle: 'medium',
                        timeZone: 'UTC',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card>
            <ReputationSummary reputation={reputation} title={t('ratingsTitle')} />
          </Card>
        </div>
      </div>
    </main>
  );
}
