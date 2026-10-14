import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { fileUrlFor } from '@/lib/file-url';
import { basisPointsToPercent, formatCompactCount } from '@/lib/format';
import type { CreatorSearchResult } from '@/services/discovery';

/** One creator in search results or a shortlist: public fields only (SR-12). */
export async function CreatorCard({
  creator,
  locale,
  selectControl,
  children,
}: {
  creator: CreatorSearchResult;
  locale: string;
  /** e.g. a "compare" checkbox. */
  selectControl?: ReactNode;
  /** Actions under the card, e.g. "add to shortlist". */
  children?: ReactNode;
}) {
  const t = await getTranslations('brand.card');
  const tCategories = await getTranslations('categories');
  const tRegions = await getTranslations('regions');
  const tTiers = await getTranslations('tiers');
  const tPlatforms = await getTranslations('platforms');
  const photoUrl = fileUrlFor(creator.photoKey);
  const location = [
    creator.city,
    creator.stateCode ? tRegions(`${creator.countryCode}.${creator.stateCode}`) : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <article className="bg-card grid gap-3 rounded-xl border p-4">
      <div className="flex items-start gap-3">
        {selectControl}
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt=""
            width={48}
            height={48}
            unoptimized
            className="size-12 rounded-full object-cover"
          />
        ) : (
          <div className="bg-muted size-12 shrink-0 rounded-full" aria-hidden />
        )}
        <div className="grid min-w-0 gap-0.5">
          <h3 className="font-semibold">
            <Link
              href={`/brand/creators/${creator.slug}`}
              className="underline-offset-4 hover:underline"
            >
              {creator.displayName}
            </Link>
          </h3>
          <p className="text-muted-foreground text-sm">{location}</p>
          <p className="text-sm">
            {creator.isVerified ? <span className="font-medium">✓ {t('verified')} · </span> : null}
            {creator.platforms.map((platform) => tPlatforms(platform)).join(', ')}
            {creator.tier ? ` · ${tTiers(creator.tier)}` : ''}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm tabular-nums">
        <div>
          <dt className="sr-only">{t('followers', { count: '' })}</dt>
          <dd>
            {t('followers', {
              count: formatCompactCount(creator.totalFollowers, locale, creator.countryCode),
            })}
          </dd>
        </div>
        <div>
          <dt className="sr-only">{t('engagement', { rate: '' })}</dt>
          <dd>{t('engagement', { rate: basisPointsToPercent(creator.engagementRateBp) })}</dd>
        </div>
        <div>
          <dt className="sr-only">{t('score', { score: '' })}</dt>
          <dd className="font-medium">
            {creator.currentScore === null
              ? t('noScore')
              : t('score', { score: creator.currentScore })}
          </dd>
        </div>
      </dl>
      <p className="text-muted-foreground text-xs">
        {creator.categorySlugs.map((slug) => tCategories(slug)).join(' · ')}
        {creator.isOpenToCollaborations ? '' : ` · ${t('closed')}`}
      </p>
      {children}
    </article>
  );
}
