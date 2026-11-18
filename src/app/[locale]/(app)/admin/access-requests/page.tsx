import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { AdminNav } from '@/components/admin/AdminNav';
import { DecisionButton } from '@/components/admin/ModerationForms';
import { StatusTabs, statusFrom } from '@/components/admin/StatusTabs';
import { Pagination } from '@/components/layout/Pagination';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/ui/card';
import { requirePageSession } from '@/lib/auth/current-session';
import { pageNumberFrom } from '@/lib/validation/page-number';
import { listAccessRequests } from '@/services/access-requests';
import { approveAccessRequestAction, declineAccessRequestAction } from '../actions';

const STATUSES = ['PENDING', 'APPROVED'] as const;

/**
 * Pilot waitlist: people asking to join. Approving lets them sign up and emails them the
 * link; declining deletes the request.
 */
export default async function AdminAccessRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['ADMIN'] });
  const t = await getTranslations('admin.accessRequests');
  const tRoles = await getTranslations('auth.signUp');
  const format = await getFormatter();
  const raw = await searchParams;
  const status = statusFrom(STATUSES, raw.status);
  const result = await listAccessRequests(getContainer(), {
    adminUserId: session.user.id,
    status,
    page: pageNumberFrom(raw.page),
  });

  return (
    <PageShell title={t('title')} intro={<AdminNav />} wide>
      <p className="text-muted-foreground text-sm">{t('intro')}</p>
      <StatusTabs
        statuses={STATUSES}
        current={status}
        basePath="/admin/access-requests"
        labelFor={(value) => t(`statuses.${value}`)}
      />
      {result.items.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {result.items.map((request) => (
            <li key={request.id}>
              <Card className="grid gap-2 p-4 text-sm">
                <p>
                  <span className="font-medium">{request.name}</span> ·{' '}
                  {request.role === 'CREATOR' ? tRoles('roleCreator') : tRoles('roleBrand')}
                  {request.city ? ` · ${request.city}` : ''}
                </p>
                <p className="break-all">{request.email}</p>
                {request.profileUrl ? (
                  <a
                    href={request.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="w-fit break-all underline"
                  >
                    {request.profileUrl}
                  </a>
                ) : null}
                <p className="text-muted-foreground text-xs">
                  {request.approvedAt
                    ? t('approvedOn', {
                        date: format.dateTime(request.approvedAt, { dateStyle: 'medium' }),
                      })
                    : t('requestedOn', {
                        date: format.dateTime(request.createdAt, { dateStyle: 'medium' }),
                      })}
                </p>
                {request.status === 'PENDING' ? (
                  <div className="flex flex-wrap gap-3">
                    <DecisionButton
                      action={approveAccessRequestAction}
                      hidden={{ requestId: request.id }}
                      label={t('approve')}
                      variant="default"
                    />
                    <DecisionButton
                      action={declineAccessRequestAction}
                      hidden={{ requestId: request.id }}
                      label={t('decline')}
                      variant="ghost"
                    />
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        hrefFor={(page) => `/admin/access-requests?status=${status}&page=${page}`}
      />
    </PageShell>
  );
}
