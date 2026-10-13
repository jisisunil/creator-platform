import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';

/** PR-10: named grievance contact, linked from every page. */
export default async function GrievancePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legal.grievance');
  const tCommon = await getTranslations('common');
  return (
    <PageShell title={t('title')}>
      <Alert>{tCommon('draftNotice')}</Alert>
      <p>{t('body')}</p>
      <p>
        {t('contactLabel')}: <span className="font-medium">{t('contactValue')}</span>
      </p>
    </PageShell>
  );
}
