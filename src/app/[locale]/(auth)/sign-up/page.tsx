import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/layout/AuthShell';
import { Alert } from '@/components/ui/alert';
import { getServerEnv, isGoogleSignInEnabled } from '@/config/env';
import { Link } from '@/i18n/navigation';
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
    <AuthShell title={t('signUp.title')} intro={t('signUp.intro')}>
      {env.SIGNUP_ALLOWLIST ? (
        <Alert>
          {t.rich('signUp.pilotNotice', {
            link: (chunks) => (
              <Link href="/early-access" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </Alert>
      ) : null}
      {query.google === 'needs-sign-up' ? <Alert>{t('signIn.googleNeedsSignUp')}</Alert> : null}
      <SignUpForm
        initialRole={query.role === 'BRAND' ? 'BRAND' : 'CREATOR'}
        isGoogleEnabled={isGoogleSignInEnabled(env)}
        captchaSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        nonce={await getNonce()}
      />
    </AuthShell>
  );
}
