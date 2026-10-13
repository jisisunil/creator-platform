import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getServerEnv, isGoogleSignInEnabled } from '@/config/env';
import { Link } from '@/i18n/navigation';
import { getCurrentSession } from '@/lib/auth/current-session';
import { readPendingGoogleLink } from '@/lib/auth/pending-oauth';
import { getNonce } from '@/lib/nonce';
import { getRequestInfo } from '@/lib/request-info';
import { isCaptchaNeededForSignIn } from '@/services/accounts';
import { startGoogleSignInAction } from '../actions';
import { LinkGoogleForm, SignInForm } from './SignInForm';

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ link?: string; google?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getCurrentSession()) redirect(`/${locale}/dashboard`);
  const query = await searchParams;
  const t = await getTranslations('auth.signIn');
  const env = getServerEnv();
  const captcha = {
    isCaptchaNeeded: await isCaptchaNeededForSignIn(
      getContainer(),
      null,
      await getRequestInfo(locale),
    ),
    captchaSiteKey: env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    nonce: await getNonce(),
  };

  const pendingLink = query.link === 'google' ? await readPendingGoogleLink() : null;
  if (pendingLink) {
    return (
      <PageShell narrow title={t('linkGoogleTitle')}>
        <p>{t('linkGoogleIntro', { email: pendingLink.email })}</p>
        <LinkGoogleForm {...captcha} />
      </PageShell>
    );
  }

  return (
    <PageShell narrow title={t('title')}>
      {query.google === 'rejected' ? (
        <Alert variant="destructive">{t('googleRejected')}</Alert>
      ) : null}
      <SignInForm {...captcha} />
      {isGoogleSignInEnabled(env) ? (
        <form action={startGoogleSignInAction}>
          <Button type="submit" variant="outline" className="w-full">
            {t('googleButton')}
          </Button>
        </form>
      ) : null}
      <p className="text-sm">
        {t('noAccount')}{' '}
        <Link href="/sign-up" className="underline">
          {t('signUpLink')}
        </Link>
      </p>
    </PageShell>
  );
}
