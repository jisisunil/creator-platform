import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/layout/AuthShell';
import { getServerEnv } from '@/config/env';
import { getCurrentSession } from '@/lib/auth/current-session';
import { getNonce } from '@/lib/nonce';
import { EarlyAccessForm } from './EarlyAccessForm';

/** Pilot waitlist: only while sign-up is invite-only; otherwise people just sign up. */
export default async function EarlyAccessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const env = getServerEnv();
  if (!env.SIGNUP_ALLOWLIST) redirect(`/${locale}/sign-up`);
  if (await getCurrentSession()) redirect(`/${locale}/dashboard`);
  const t = await getTranslations('auth.earlyAccess');

  return (
    <AuthShell title={t('title')} intro={t('intro')}>
      <EarlyAccessForm
        captchaSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        nonce={await getNonce()}
      />
    </AuthShell>
  );
}
