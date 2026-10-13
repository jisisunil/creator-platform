import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { requirePageSession } from '@/lib/auth/current-session';
import { findBrandMembership } from '@/services/team';

/** Landing page after sign-in; each role's real home arrives in later phases. */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale);
  const t = await getTranslations('dashboard');
  const title = t('welcome', { name: session.user.name });

  if (session.user.role === 'BRAND') {
    const membership = await findBrandMembership(getContainer(), session.user.id);
    return (
      <PageShell title={title}>
        <p>
          {membership ? t('brandIntro', { brandName: membership.brandName }) : t('brandNoTeam')}
        </p>
      </PageShell>
    );
  }
  return (
    <PageShell title={title}>
      <p>{session.user.role === 'ADMIN' ? t('adminIntro') : t('creatorIntro')}</p>
    </PageShell>
  );
}
