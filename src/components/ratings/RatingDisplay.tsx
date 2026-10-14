import { getFormatter, getTranslations } from 'next-intl/server';
import { RATING_CRITERIA, type RatingCriterion } from '@/domain/ratings';
import type { RatingRecord, Reputation } from '@/services/ratings';

const TENTHS = 10;

/** "4.6" from 46 tenths. */
function starsFromTenths(tenths: number): string {
  return (tenths / TENTHS).toFixed(1);
}

/** FR-10.2: average stars, number of ratings and the latest comments. */
export async function ReputationSummary({
  reputation,
  title,
}: {
  reputation: Reputation;
  title: string;
}) {
  const t = await getTranslations('ratings');
  const format = await getFormatter();
  return (
    <section className="grid gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {reputation.averageTenths === null ? (
        <p className="text-muted-foreground text-sm">{t('noRatingsYet')}</p>
      ) : (
        <>
          <p className="text-sm">
            {t('average', {
              stars: starsFromTenths(reputation.averageTenths),
              count: reputation.count,
            })}
          </p>
          {reputation.recent.length > 0 ? (
            <ul className="grid gap-2">
              {reputation.recent.map((review) => (
                <li key={review.createdAt.toISOString()} className="text-sm">
                  <span className="font-medium">
                    {t('starsShort', { stars: starsFromTenths(review.averageTenths) })}
                  </span>{' '}
                  “{review.comment}”
                  <span className="text-muted-foreground">
                    {' '}
                    · {format.dateTime(review.createdAt, { dateStyle: 'medium' })}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

/** One rating: the stars per criterion and the comment. */
export async function RatingDetails({ rating }: { rating: RatingRecord }) {
  const t = await getTranslations('ratings');
  return (
    <div className="grid gap-1 text-sm">
      <ul>
        {RATING_CRITERIA[rating.raterSide].map((criterion: RatingCriterion) => (
          <li key={criterion}>
            {t(`criteriaShort.${criterion}`)}:{' '}
            {t('stars', { count: rating.scores[criterion] ?? 0 })}
          </li>
        ))}
      </ul>
      {rating.comment ? <p>“{rating.comment}”</p> : null}
    </div>
  );
}
