import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { ResetPasswordForm } from './ResetPasswordForm';

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token } = await searchParams;
  const t = await getTranslations('auth');
  return (
    <PageShell narrow title={t('resetPassword.title')}>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert variant="destructive">{t('verifyEmail.missingToken')}</Alert>
      )}
    </PageShell>
  );
}
