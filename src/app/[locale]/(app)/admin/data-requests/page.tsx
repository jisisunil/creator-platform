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
import { cn } from '@/lib/utils';
import { pageNumberFrom } from '@/lib/validation/page-number';
import { listDataRequests } from '@/services/privacy';
import { closeDataRequestAction } from '../actions';

const STATUSES = ['OPEN', 'COMPLETED', 'REJECTED'] as const;

/**
 * UC-M4 / PR-5: privacy requests against their 30-day due date. Corrections are answered
 * here; deletions finish on their own; exports are instant and listed for the record.
 */
export default async function AdminDataRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['ADMIN'] });
  const t = await getTranslations('admin.dataRequests');
  const tTypes = await getTranslations('settings.data.types');
  const format = await getFormatter();
  const raw = await searchParams;
  const status = statusFrom(STATUSES, raw.status);
  const result = await listDataRequests(getContainer(), {
    adminUserId: session.user.id,
    status,
    page: pageNumberFrom(raw.page),
  });

  return (
    <PageShell title={t('title')} intro={<AdminNav />} wide>
      <StatusTabs
        statuses={STATUSES}
        current={status}
        basePath="/admin/data-requests"
        labelFor={(value) => t(`statuses.${value}`)}
      />
      {result.items.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {result.items.map((request) => {
            const { isOverdue } = request;
            return (
              <li key={request.id}>
                <Card className={cn('grid gap-2 p-4 text-sm', isOverdue && 'border-destructive')}>
                  <p>
                    <span className="font-medium">{tTypes(request.type)}</span> ·{' '}
                    <Link href={`/admin/users/${request.userId}`} className="underline">
                      {request.userName}
                    </Link>
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t('dates', {
                      created: format.dateTime(request.createdAt, { dateStyle: 'medium' }),
                      due: format.dateTime(request.dueAt, { dateStyle: 'medium' }),
                    })}
                    {isOverdue ? ` · ${t('overdue')}` : ''}
                  </p>
                  {request.details ? (
                    <p className="whitespace-pre-line">{request.details}</p>
                  ) : null}
                  {request.resolution ? (
                    <p className="text-muted-foreground">{request.resolution}</p>
                  ) : null}
                  {request.status === 'OPEN' && request.type === 'CORRECTION' ? (
                    <div className="grid gap-6 sm:grid-cols-2">
                      <ReasonForm
                        action={closeDataRequestAction}
                        hidden={{ requestId: request.id, outcome: 'COMPLETED' }}
                        fieldName="resolution"
                        label={t('answer')}
                        submitLabel={t('complete')}
                      />
                      <ReasonForm
                        action={closeDataRequestAction}
                        hidden={{ requestId: request.id, outcome: 'REJECTED' }}
                        fieldName="resolution"
                        label={t('rejectReason')}
                        submitLabel={t('reject')}
                        variant="ghost"
                      />
                    </div>
                  ) : null}
                  {request.status === 'OPEN' && request.type === 'DELETION' ? (
                    <p className="text-muted-foreground text-xs">{t('deletionAutomatic')}</p>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        hrefFor={(page) => `/admin/data-requests?status=${status}&page=${page}`}
      />
    </PageShell>
  );
}
