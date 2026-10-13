import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { confirmEmailChangeAction } from '../../actions';
import { TokenConfirmForm } from '../../TokenConfirmForm';

export default async function ConfirmEmailChangePage({
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
    <PageShell narrow title={t('changeEmailConfirm.title')}>
      {token ? (
        <TokenConfirmForm
          token={token}
          action={confirmEmailChangeAction}
          submitLabel={t('changeEmailConfirm.title')}
          successMessage={t('changeEmailConfirm.success')}
          continueHref="/settings"
          continueLabel={t('changeEmailConfirm.continue')}
        />
      ) : (
        <Alert variant="destructive">{t('verifyEmail.missingToken')}</Alert>
      )}
    </PageShell>
  );
}
