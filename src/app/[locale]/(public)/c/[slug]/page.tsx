import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { CreatorProfileView } from '@/components/creators/CreatorProfileView';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { isDomainError } from '@/domain/errors';
import { getRequestInfo } from '@/lib/request-info';
import { viewPublicProfile } from '@/services/discovery';

/** FR-2.4 / UC-D2: a creator's public profile; rate-limited per IP against scraping (SEC-3). */
export default async function PublicCreatorPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('publicProfile');
  let profile;
  try {
    profile = await viewPublicProfile(getContainer(), slug, await getRequestInfo(locale));
  } catch (error) {
    if (!isDomainError(error) || error.code !== 'RATE_LIMITED') throw error;
    const tErrors = await getTranslations('errors');
    return (
      <PageShell title={t('unavailable')}>
        <Alert variant="destructive">{tErrors('RATE_LIMITED')}</Alert>
      </PageShell>
    );
  }
  if (!profile) {
    return (
      <PageShell title={t('unavailable')}>
        <p>{t('unavailableText')}</p>
      </PageShell>
    );
  }
  return <CreatorProfileView profile={profile} locale={locale} />;
}
