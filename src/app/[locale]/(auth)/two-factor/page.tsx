import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { requirePageSession } from '@/lib/auth/current-session';
import { hasTwoFactorEnabled, startTotpEnrolment } from '@/services/accounts';
import { TwoFactorForm } from './TwoFactorForm';

/** SR-4: admins set up (first time) or enter (every session) a TOTP code. */
export default async function TwoFactorPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, {
    allowPendingTwoFactor: true,
    allowPendingConsent: true,
  });
  if (session.isTwoFactorSatisfied) redirect(`/${locale}/dashboard`);
  const t = await getTranslations('auth.twoFactor');
  const container = getContainer();

  if (await hasTwoFactorEnabled(container, session.user.id)) {
    return (
      <PageShell narrow title={t('verifyTitle')} intro={t('verifyIntro')}>
        <TwoFactorForm />
      </PageShell>
    );
  }

  const enrolment = await startTotpEnrolment(container, session.user.id);
  const qrDataUrl = await QRCode.toDataURL(enrolment.uri, { margin: 1, width: 220 });
  return (
    <PageShell narrow title={t('setupTitle')} intro={t('setupIntro')}>
      <Image
        src={qrDataUrl}
        alt={t('qrAlt')}
        width={220}
        height={220}
        unoptimized
        className="rounded border"
      />
      <div className="text-sm">
        <p>{t('secretLabel')}</p>
        <code className="bg-muted mt-1 block rounded p-2 break-all" data-testid="totp-secret">
          {enrolment.secret}
        </code>
      </div>
      <TwoFactorForm />
    </PageShell>
  );
}
