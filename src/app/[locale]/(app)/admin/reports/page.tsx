import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { AdminNav } from '@/components/admin/AdminNav';
import { StatusTabs, statusFrom } from '@/components/admin/StatusTabs';
import { Pagination } from '@/components/layout/Pagination';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { pageNumberFrom } from '@/lib/validation/page-number';
import { listReports } from '@/services/moderation';

const STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;

/** UC-M1: the reports queue, oldest open reports first. */
export default async function AdminReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['ADMIN'] });
  const t = await getTranslations('admin.reports');
  const format = await getFormatter();
  const raw = await searchParams;
  const status = statusFrom(STATUSES, raw.status);
  const result = await listReports(getContainer(), {
    adminUserId: session.user.id,
    status,
    page: pageNumberFrom(raw.page),
  });

  return (
    <PageShell title={t('title')} intro={<AdminNav />} wide>
      <StatusTabs
        statuses={STATUSES}
        current={status}
        basePath="/admin/reports"
        labelFor={(value) => t(`statuses.${value}`)}
      />
      {result.items.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {result.items.map((report) => (
            <li key={report.id}>
              <Card className="grid gap-1 p-4">
                <Link href={`/admin/reports/${report.id}`} className="font-medium underline">
                  {t(`targets.${report.targetType}`)}
                </Link>
                <p className="text-sm">{report.reason}</p>
                <p className="text-muted-foreground text-xs">
                  {t('filed', {
                    name: report.reporter?.name ?? t('deletedUser'),
                    date: format.dateTime(report.createdAt, { dateStyle: 'medium' }),
                  })}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        hrefFor={(page) => `/admin/reports?status=${status}&page=${page}`}
      />
    </PageShell>
  );
}
