import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import {
  AddCreditPackForm,
  ChangePlanForm,
  ExtendTrialForm,
  SuspendUserForm,
  UserActionButton,
} from '@/components/admin/AdminForms';
import { AdminNav } from '@/components/admin/AdminNav';
import { ReasonForm } from '@/components/admin/ModerationForms';
import { PageShell } from '@/components/layout/PageShell';
import { Card, CardTitle } from '@/components/ui/card';
import { isDomainError } from '@/domain/errors';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { getRequestInfo } from '@/lib/request-info';
import { getUserDetail, type UserDetail } from '@/services/admin';
import {
  deleteUnderageAction,
  refreshCreatorAction,
  scheduleDeletionAction,
  reinstateUserAction,
  suspendUserAction,
  verifyUserEmailAction,
} from '../../actions';

/** FR-13.1 / FR-13.2: one user, with suspend, reinstate, verify, refresh and plan tools. */
export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['ADMIN'] });
  const t = await getTranslations('admin.users');
  const tNames = await getTranslations('plans.names');
  const format = await getFormatter();

  let user: UserDetail;
  try {
    user = await getUserDetail(getContainer(), {
      adminUserId: session.user.id,
      userId: id,
      request: await getRequestInfo(locale),
    });
  } catch (error) {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const date = (value: Date | null) =>
    value ? format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short' }) : t('never');
  const isManageable = user.role !== 'ADMIN';

  return (
    <PageShell title={user.name} intro={<AdminNav />} wide>
      <Card className="grid gap-3">
        <CardTitle>{t('account')}</CardTitle>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t('email')}</dt>
          <dd className="break-all">{user.email}</dd>
          <dt className="text-muted-foreground">{t('role')}</dt>
          <dd>{t(`roles.${user.role}`)}</dd>
          <dt className="text-muted-foreground">{t('status')}</dt>
          <dd>{t(`statuses.${user.status}`)}</dd>
          <dt className="text-muted-foreground">{t('joined')}</dt>
          <dd>{date(user.createdAt)}</dd>
          <dt className="text-muted-foreground">{t('emailVerified')}</dt>
          <dd>{date(user.emailVerifiedAt)}</dd>
          <dt className="text-muted-foreground">{t('lastSignIn')}</dt>
          <dd>{date(user.lastLoginAt)}</dd>
        </dl>
      </Card>

      {isManageable ? (
        <Card className="grid gap-4">
          <CardTitle>{t('actions')}</CardTitle>
          {user.status === 'ACTIVE' ? (
            <SuspendUserForm action={suspendUserAction} userId={user.id} />
          ) : null}
          {user.status === 'SUSPENDED' ? (
            <UserActionButton
              action={reinstateUserAction}
              userId={user.id}
              label={t('reinstate')}
              successMessage={t('reinstated')}
            />
          ) : null}
          {user.status === 'ACTIVE' || user.status === 'SUSPENDED' ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <ReasonForm
                action={scheduleDeletionAction}
                hidden={{ userId: user.id }}
                fieldName="reason"
                label={t('deleteReason')}
                submitLabel={t('delete')}
                variant="destructive"
                successMessage={t('deletionScheduled')}
              />
              <ReasonForm
                action={deleteUnderageAction}
                hidden={{ userId: user.id }}
                fieldName="reason"
                label={t('underageReason')}
                submitLabel={t('deleteUnderage')}
                variant="destructive"
                successMessage={t('deletedNow')}
              />
            </div>
          ) : null}
          {user.emailVerifiedAt === null ? (
            <UserActionButton
              action={verifyUserEmailAction}
              userId={user.id}
              label={t('verifyEmail')}
              confirmText={t('verifyEmailConfirm')}
            />
          ) : null}
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">{t('adminNotManaged')}</p>
      )}

      {user.creator ? (
        <Card className="grid gap-3">
          <CardTitle>{t('creatorProfile')}</CardTitle>
          <p className="text-sm">
            <Link href={`/c/${user.creator.slug}`} className="underline">
              {user.creator.displayName}
            </Link>{' '}
            · {user.creator.isSearchable ? t('inSearch') : t('notInSearch')}
          </p>
          <ul className="text-sm">
            {user.creator.accounts.map((account) => (
              <li key={`${account.platform}-${account.handle}`}>
                {account.platform} {account.handle} · {account.status}
              </li>
            ))}
          </ul>
          <UserActionButton
            action={refreshCreatorAction}
            userId={user.id}
            label={t('refreshNow')}
            successMessage={t('refreshQueued')}
          />
        </Card>
      ) : null}

      {user.brand ? (
        <Card className="grid gap-4">
          <CardTitle>
            {t('brand', { name: user.brand.name, plan: tNames(user.brand.planCode) })}
          </CardTitle>
          {user.brand.trialEndsAt ? (
            <p className="text-sm">{t('trialEnds', { date: date(user.brand.trialEndsAt) })}</p>
          ) : null}
          <div className="grid gap-6 sm:grid-cols-3">
            <ChangePlanForm
              brandId={user.brand.id}
              userId={user.id}
              currentPlanCode={user.brand.planCode}
            />
            {user.brand.planCode === 'TRIAL' ? (
              <ExtendTrialForm brandId={user.brand.id} userId={user.id} />
            ) : null}
            <AddCreditPackForm brandId={user.brand.id} userId={user.id} />
          </div>
        </Card>
      ) : null}
    </PageShell>
  );
}
