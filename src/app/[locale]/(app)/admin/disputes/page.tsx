import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { AdminNav } from '@/components/admin/AdminNav';
import { ReasonForm } from '@/components/admin/ModerationForms';
import { StatusTabs, statusFrom } from '@/components/admin/StatusTabs';
import { Pagination } from '@/components/layout/Pagination';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { pageNumberFrom } from '@/lib/validation/page-number';
import { listDisputes } from '@/services/moderation';
import { resolveDisputeAction } from '../moderation-actions';

const STATUSES = ['OPEN', 'RESOLVED'] as const;

/** UC-M3: accounts claimed by a second creator; the admin decides who owns them. */
export default async function AdminDisputesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['ADMIN'] });
  const t = await getTranslations('admin.disputes');
  const tPlatforms = await getTranslations('platforms');
  const format = await getFormatter();
  const raw = await searchParams;
  const status = statusFrom(STATUSES, raw.status);
  const result = await listDisputes(getContainer(), {
    adminUserId: session.user.id,
    status,
    page: pageNumberFrom(raw.page),
  });

  return (
    <PageShell title={t('title')} intro={<AdminNav />} wide>
      <StatusTabs
        statuses={STATUSES}
        current={status}
        basePath="/admin/disputes"
        labelFor={(value) => t(`statuses.${value}`)}
      />
      {result.items.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {result.items.map((dispute) => {
            const bothVerified = dispute.isClaimVerified && dispute.account.isVerified;
            return (
              <li key={dispute.id}>
                <Card className="grid gap-3 p-4 text-sm">
                  <p className="font-medium">
                    {tPlatforms(dispute.account.platform)} {dispute.account.handle}
                  </p>
                  <p>
                    {t('owner')}{' '}
                    <Link
                      href={`/admin/users/${dispute.account.ownerUserId}`}
                      className="underline"
                    >
                      {dispute.account.ownerName}
                    </Link>{' '}
                    · {dispute.account.isVerified ? t('verified') : t('notVerified')}
                  </p>
                  <p>
                    {t('claimant')}{' '}
                    <Link href={`/admin/users/${dispute.claimant.userId}`} className="underline">
                      {dispute.claimant.name}
                    </Link>{' '}
                    · {dispute.isClaimVerified ? t('verified') : t('notVerified')} ·{' '}
                    {format.dateTime(dispute.createdAt, { dateStyle: 'medium' })}
                  </p>
                  {dispute.status === 'OPEN' ? (
                    <>
                      <p className="rounded-md bg-amber-50 px-2 py-1 text-amber-900">
                        {bothVerified
                          ? t('suggestTransfer')
                          : dispute.isClaimVerified
                            ? t('claimantProved')
                            : t('claimUnverified')}
                      </p>
                      <div className="grid gap-6 sm:grid-cols-2">
                        <ReasonForm
                          action={resolveDisputeAction}
                          hidden={{ disputeId: dispute.id, decision: 'TRANSFER' }}
                          fieldName="note"
                          label={t('note')}
                          submitLabel={t('transfer')}
                        />
                        <ReasonForm
                          action={resolveDisputeAction}
                          hidden={{ disputeId: dispute.id, decision: 'KEEP' }}
                          fieldName="note"
                          label={t('note')}
                          submitLabel={t('keep')}
                          variant="ghost"
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground">{dispute.resolution}</p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        hrefFor={(page) => `/admin/disputes?status=${status}&page=${page}`}
      />
    </PageShell>
  );
}
