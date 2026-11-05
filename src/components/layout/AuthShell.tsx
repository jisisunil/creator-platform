import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

const POINTS = ['verified', 'transparent', 'private'] as const;

/**
 * Sign-in and sign-up: the form in a card, beside a short statement of what the platform
 * stands for (wide screens only; on phones the form comes first and alone).
 */
export async function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const t = await getTranslations('authPanel');
  return (
    <main id="main" className="mx-auto grid max-w-6xl gap-12 px-4 py-12 md:grid-cols-2 md:py-20">
      <aside className="hidden flex-col justify-center md:flex">
        <p className="eyebrow">{t('eyebrow')}</p>
        <p className="mt-6 max-w-md font-serif text-6xl leading-[1.02] text-balance">
          {t.rich('statement', {
            em: (chunks) => <em className="display-accent">{chunks}</em>,
          })}
        </p>
        <ul className="mt-10 grid max-w-md gap-4">
          {POINTS.map((point) => (
            <li key={point} className="text-muted-foreground flex gap-3 text-sm">
              <span aria-hidden="true" className="text-brand">
                ✓
              </span>
              {t(`points.${point}`)}
            </li>
          ))}
        </ul>
      </aside>
      <div className="bg-card mx-auto w-full max-w-md rounded-2xl border p-6 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.18)] sm:p-8">
        <h1 className="text-4xl leading-tight">{title}</h1>
        {intro ? <div className="text-muted-foreground mt-3 text-sm">{intro}</div> : null}
        <div className="mt-8 grid gap-6">{children}</div>
      </div>
    </main>
  );
}
