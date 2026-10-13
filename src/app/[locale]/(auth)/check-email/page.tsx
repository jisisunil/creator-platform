import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageShell } from '@/components/layout/PageShell';
import { ResendVerificationForm } from '../sign-in/ResendVerificationForm';

export default async function CheckEmailPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth.checkEmail');
  return (
    <PageShell narrow title={t('title')} intro={t('body')}>
      <p className="text-sm">{t('resendPrompt')}</p>
      <ResendVerificationForm />
    </PageShell>
  );
}
