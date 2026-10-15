import { getTranslations } from 'next-intl/server';
import type { ScoreBreakdown as Breakdown } from '@/domain/score';

const COMPONENTS = ['engagement', 'consistency', 'growth', 'authenticity', 'completeness'] as const;

/**
 * FR-4.2: the transparent score breakdown. Each component is a labelled 0–100 meter in a
 * single hue; the number is always printed, so nothing is conveyed by colour alone.
 */
export async function ScoreBreakdown({
  score,
  components,
  weightsVersion,
}: {
  score: number;
  components: Breakdown['components'];
  weightsVersion: string;
}) {
  const t = await getTranslations('score');
  const detail: Record<(typeof COMPONENTS)[number], string> = {
    engagement: t('explain.engagement'),
    consistency: t('postsValue', { count: components.consistency.postsLast30Days }),
    growth:
      components.growth.growthPercent === null
        ? t('growthNotYet')
        : t('growthValue', { percent: components.growth.growthPercent }),
    authenticity: t('flagsValue', { count: components.authenticity.flags.length }),
    completeness: t('explain.completeness'),
  };

  return (
    <div className="grid gap-4">
      <p className="text-3xl font-bold" aria-label={t('outOf', { score })}>
        {score}
        <span className="text-muted-foreground text-base font-normal"> / 100</span>
      </p>
      <dl className="grid gap-3">
        {COMPONENTS.map((name) => {
          const value = components[name].score;
          return (
            // dt and dd sit directly in the group div, as definition lists require (NFR-9).
            <div key={name} className="grid grid-cols-[1fr_auto] items-baseline gap-x-2 gap-y-1">
              <dt className="text-sm font-medium">{t(`components.${name}`)}</dt>
              <dd className="text-sm tabular-nums">{value}</dd>
              <dd className="col-span-2">
                <div
                  className="bg-muted h-2 overflow-hidden rounded-full"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={value}
                  aria-label={t(`components.${name}`)}
                >
                  <div
                    className="h-full rounded-full bg-[#2a78d6]"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </dd>
              <dd className="text-muted-foreground col-span-2 text-xs">{detail[name]}</dd>
            </div>
          );
        })}
      </dl>
      <p className="text-muted-foreground text-xs">
        {t('weightsVersion', { version: weightsVersion })}
      </p>
    </div>
  );
}
