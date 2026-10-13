import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legal.terms');
  const tCommon = await getTranslations('common');
  return (
    <PageShell title={t('title')}>
      <Alert>{tCommon('draftNotice')}</Alert>
      <p>{t('body')}</p>
    </PageShell>
  );
}
