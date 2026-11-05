import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

const STEPS = ['one', 'two', 'three'] as const;
const PRINCIPLES = ['verified', 'transparent', 'privacy'] as const;
/** The example card's figures: an illustration of the score breakdown, labelled as such. */
const EXAMPLE_COMPONENTS = [
  ['engagement', 88],
  ['consistency', 76],
  ['growth', 71],
  ['authenticity', 94],
] as const;
const EXAMPLE_SCORE = 82;

/** The <em> phrase in a headline string: serif italic in the accent colour. */
const accent = (chunks: ReactNode) => <em className="display-accent">{chunks}</em>;
const accentOnDark = (chunks: ReactNode) => (
  <em className="display-accent text-brand-light">{chunks}</em>
);

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const tScore = await getTranslations('score');

  return (
    <main id="main">
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 md:grid-cols-[1.15fr_1fr] md:pt-24">
        <div>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className="mt-6 text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">
            {t.rich('headline', { em: accent })}
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed">
            {t('intro')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={{ pathname: '/sign-up', query: { role: 'CREATOR' } }}>
                {t('ctaCreator')}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={{ pathname: '/sign-up', query: { role: 'BRAND' } }}>{t('ctaBrand')}</Link>
            </Button>
          </div>
        </div>

        {/* An illustration of a profile's transparent score, clearly labelled as an example. */}
        <figure className="bg-card rounded-2xl border p-6 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.18)] sm:p-8">
          <figcaption className="eyebrow">{t('example.label')}</figcaption>
          <div className="mt-5 flex items-start justify-between gap-4">
            <div>
              <p className="font-serif text-3xl leading-tight">{t('example.name')}</p>
              <p className="text-muted-foreground mt-1 text-sm">{t('example.meta')}</p>
            </div>
            <span className="bg-brand-soft text-brand shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap">
              ✓ {t('example.verified')}
            </span>
          </div>
          <div className="mt-8 flex items-end gap-3">
            <p className="font-serif text-7xl leading-none tabular-nums">{EXAMPLE_SCORE}</p>
            <p className="text-muted-foreground pb-2 text-sm">{t('example.scoreLabel')}</p>
          </div>
          <dl className="mt-6 grid gap-3">
            {EXAMPLE_COMPONENTS.map(([name, value]) => (
              <div key={name} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
                <dt className="text-sm">{tScore(`components.${name}`)}</dt>
                <dd className="text-sm tabular-nums">{value}</dd>
                <dd className="bg-muted col-span-2 h-1 overflow-hidden rounded-full">
                  <div className="bg-brand h-full rounded-full" style={{ width: `${value}%` }} />
                </dd>
              </div>
            ))}
          </dl>
        </figure>
      </section>

      <section className="below-fold border-y bg-white/60">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:grid-cols-2">
          {(['creators', 'brands'] as const).map((audience) => (
            <div key={audience}>
              <p className="eyebrow">{t(`how.${audience}.eyebrow`)}</p>
              <h2 className="mt-4 font-serif text-4xl leading-tight">
                {t(`how.${audience}.title`)}
              </h2>
              <ol className="mt-8 grid gap-6">
                {STEPS.map((step, index) => (
                  <li key={step} className="grid grid-cols-[2.75rem_1fr] gap-4">
                    <span
                      aria-hidden="true"
                      className="text-brand font-serif text-3xl leading-none italic tabular-nums"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <p className="font-medium">{t(`how.${audience}.${step}.title`)}</p>
                      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                        {t(`how.${audience}.${step}.text`)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="below-fold mx-auto max-w-6xl px-4 py-20">
        <p className="eyebrow">{t('principles.eyebrow')}</p>
        <h2 className="mt-3 max-w-2xl font-serif text-4xl leading-tight">
          {t.rich('principles.title', { em: accent })}
        </h2>
        <div className="mt-12 grid gap-10 md:grid-cols-3">
          {PRINCIPLES.map((principle) => (
            <div key={principle} className="border-t pt-6">
              <h3 className="font-medium">{t(`principles.${principle}.title`)}</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {t(`principles.${principle}.text`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="below-fold mx-auto max-w-6xl px-4 pb-8">
        <div className="bg-primary text-primary-foreground rounded-2xl px-6 py-14 text-center sm:px-12">
          <h2 className="font-serif text-4xl leading-tight sm:text-5xl">
            {t.rich('closing.title', { em: accentOnDark })}
          </h2>
          <p className="mx-auto mt-4 max-w-xl opacity-80">{t('closing.text')}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="secondary">
              <Link href={{ pathname: '/sign-up', query: { role: 'CREATOR' } }}>
                {t('ctaCreator')}
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="text-primary-foreground hover:text-primary border-white/40 bg-transparent"
            >
              <Link href={{ pathname: '/sign-up', query: { role: 'BRAND' } }}>{t('ctaBrand')}</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
