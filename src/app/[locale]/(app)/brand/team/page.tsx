import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { Card, CardTitle } from '@/components/ui/card';
import { requirePageSession } from '@/lib/auth/current-session';
import { findBrandMembership, getTeamOverview } from '@/services/team';
import { InviteMemberForm, RemoveMemberButton, RevokeInviteButton } from './TeamForms';

/** UC-A6: the brand's members, pending invites and seat usage. */
export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND'] });
  const t = await getTranslations('team');
  const container = getContainer();

  if (!(await findBrandMembership(container, session.user.id))) {
    const tDashboard = await getTranslations('dashboard');
    return (
      <PageShell title={t('title')}>
        <Alert>{tDashboard('brandNoTeam')}</Alert>
      </PageShell>
    );
  }

  const team = await getTeamOverview(container, session.user.id);
  const format = await getFormatter();
  const isOwner = team.viewerRole === 'OWNER';
  const usedSeats = team.members.length + team.pendingInvites.length;

  return (
    <PageShell
      title={`${t('title')}: ${team.brandName}`}
      intro={t('seats', { used: usedSeats, limit: team.seatLimit })}
    >
      <Card>
        <CardTitle>{t('members')}</CardTitle>
        <ul className="mt-3 grid gap-3">
          {team.members.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-medium">{member.name}</span>{' '}
                <span className="text-muted-foreground text-sm break-all">{member.email}</span>{' '}
                <span className="text-muted-foreground text-xs">
                  ({member.role === 'OWNER' ? t('owner') : t('member')})
                </span>
              </span>
              {isOwner && member.role === 'MEMBER' ? (
                <RemoveMemberButton userId={member.userId} name={member.name} />
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {isOwner ? (
        <>
          <Card>
            <CardTitle>{t('pending')}</CardTitle>
            {team.pendingInvites.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">{t('noPending')}</p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {team.pendingInvites.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="break-all">{invite.email}</span>{' '}
                      <span className="text-muted-foreground text-xs">
                        {t('expires', {
                          date: format.dateTime(invite.expiresAt, { dateStyle: 'medium' }),
                        })}
                      </span>
                    </span>
                    <RevokeInviteButton inviteId={invite.id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>{t('inviteTitle')}</CardTitle>
            <div className="mt-4">
              {team.canInvite ? <InviteMemberForm /> : <Alert>{t('seatsFull')}</Alert>}
            </div>
          </Card>
        </>
      ) : (
        <Alert>{t('ownerOnly')}</Alert>
      )}
    </PageShell>
  );
}
