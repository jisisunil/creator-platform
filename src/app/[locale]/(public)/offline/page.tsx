import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageShell } from '@/components/layout/PageShell';

/** NFR-5: cached by the service worker (public/sw.js) and shown when the network drops. */
export default async function OfflinePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('offline');
  return (
    <PageShell title={t('title')}>
      <p>{t('body')}</p>
    </PageShell>
  );
}
