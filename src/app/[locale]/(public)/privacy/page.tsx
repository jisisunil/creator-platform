import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { COUNTRY_SETTINGS, LAUNCH_COUNTRY_CODE } from '@/config/countries';

const SECTIONS = [
  'who',
  'what',
  'notCollected',
  'sharing',
  'retention',
  'rights',
  'complaints',
] as const;

/** PR-1: standalone privacy notice in English and Hindi. */
export default async function PrivacyNoticePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legal.privacy');
  const tCommon = await getTranslations('common');
  const version =
    COUNTRY_SETTINGS.find((country) => country.code === LAUNCH_COUNTRY_CODE)
      ?.privacyNoticeVersion ?? '';
  return (
    <PageShell title={t('title')} intro={t('version', { version })}>
      <Alert>{tCommon('draftNotice')}</Alert>
      {SECTIONS.map((section) => (
        <section key={section}>
          <h2 className="text-lg font-semibold">{t(`sections.${section}.title`)}</h2>
          <p className="mt-2">{t(`sections.${section}.body`)}</p>
        </section>
      ))}
    </PageShell>
  );
}
