import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { getCurrentSession } from '@/lib/auth/current-session';
import { findInvite } from '@/services/team';
import { AcceptInviteNewAccountForm, AcceptInviteSignedInForm } from './InviteForms';

/** UC-A6: landing page of a team invite link. */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth.invite');
  const invite = await findInvite(getContainer(), token);
  if (!invite) {
    return (
      <PageShell narrow title={t('accept')}>
        <Alert variant="destructive">{t('invalid')}</Alert>
      </PageShell>
    );
  }

  const session = await getCurrentSession();
  const title = t('title', { brandName: invite.brandName });
  const intro = t('intro', { brandName: invite.brandName, email: invite.email });

  if (session) {
    const isSameAccount = session.user.email === invite.email;
    return (
      <PageShell narrow title={title} intro={intro}>
        <p className="text-sm">{t('signedInAs', { email: session.user.email })}</p>
        {isSameAccount ? (
          <AcceptInviteSignedInForm token={token} />
        ) : (
          <Alert variant="destructive">{t('wrongAccount')}</Alert>
        )}
      </PageShell>
    );
  }

  return (
    <PageShell narrow title={title} intro={intro}>
      <h2 className="text-lg font-semibold">{t('createAccount')}</h2>
      <AcceptInviteNewAccountForm token={token} />
    </PageShell>
  );
}
