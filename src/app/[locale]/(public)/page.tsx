import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('home');

  return (
    <>
      <header className="mx-auto flex max-w-5xl items-center justify-end px-4 py-4">
        <LanguageSwitcher />
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 pt-8 pb-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('headline')}</h1>
        <p className="text-muted-foreground mt-4 max-w-2xl text-lg">{t('intro')}</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <section className="rounded-lg border p-6">
            <h2 className="text-xl font-semibold">{t('forCreators')}</h2>
            <p className="text-muted-foreground mt-2">{t('forCreatorsText')}</p>
          </section>
          <section className="rounded-lg border p-6">
            <h2 className="text-xl font-semibold">{t('forBrands')}</h2>
            <p className="text-muted-foreground mt-2">{t('forBrandsText')}</p>
          </section>
        </div>
      </main>
    </>
  );
}
