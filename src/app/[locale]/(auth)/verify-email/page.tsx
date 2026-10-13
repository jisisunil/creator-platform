import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { verifyEmailAction } from '../actions';
import { TokenConfirmForm } from '../TokenConfirmForm';

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token } = await searchParams;
  const t = await getTranslations('auth.verifyEmail');
  return (
    <PageShell narrow title={t('title')}>
      {token ? (
        <TokenConfirmForm
          token={token}
          action={verifyEmailAction}
          submitLabel={t('title')}
          successMessage={t('success')}
          continueHref="/sign-in"
          continueLabel={t('continue')}
        />
      ) : (
        <Alert variant="destructive">{t('missingToken')}</Alert>
      )}
    </PageShell>
  );
}
