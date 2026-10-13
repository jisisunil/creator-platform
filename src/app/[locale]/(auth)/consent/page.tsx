import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { getConsentStatus } from '@/services/consent';
import { acceptPrivacyNoticeAction } from '../actions';

/** PRV-8: asks the user to agree to a materially changed privacy notice. */
export default async function ConsentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { allowPendingConsent: true });
  const status = await getConsentStatus(getContainer(), session.user);
  if (!status.needsReconsent) redirect(`/${locale}/dashboard`);
  const t = await getTranslations('auth.consent');
  return (
    <PageShell narrow title={t('title')} intro={t('intro')}>
      <Link href="/privacy" target="_blank" className="underline">
        {t('readNotice')}
      </Link>
      <form action={acceptPrivacyNoticeAction}>
        <Button type="submit" className="w-full">
          {t('accept')}
        </Button>
      </form>
    </PageShell>
  );
}
