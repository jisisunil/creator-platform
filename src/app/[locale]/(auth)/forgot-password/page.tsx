import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageShell } from '@/components/layout/PageShell';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth.forgotPassword');
  return (
    <PageShell narrow title={t('title')} intro={t('intro')}>
      <ForgotPasswordForm />
    </PageShell>
  );
}
