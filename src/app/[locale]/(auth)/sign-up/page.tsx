import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { getServerEnv, isGoogleSignInEnabled } from '@/config/env';
import { getCurrentSession } from '@/lib/auth/current-session';
import { getNonce } from '@/lib/nonce';
import { SignUpForm } from './SignUpForm';

export default async function SignUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ role?: string; google?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getCurrentSession()) redirect(`/${locale}/dashboard`);
  const query = await searchParams;
  const t = await getTranslations('auth');
  const env = getServerEnv();

  return (
    <PageShell narrow title={t('signUp.title')} intro={t('signUp.intro')}>
      {query.google === 'needs-sign-up' ? <Alert>{t('signIn.googleNeedsSignUp')}</Alert> : null}
      <SignUpForm
        initialRole={query.role === 'BRAND' ? 'BRAND' : 'CREATOR'}
        isGoogleEnabled={isGoogleSignInEnabled(env)}
        captchaSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        nonce={await getNonce()}
      />
    </PageShell>
  );
}
