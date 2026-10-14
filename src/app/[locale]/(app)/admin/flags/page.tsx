import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { AdminNav } from '@/components/admin/AdminNav';
import { DecisionButton } from '@/components/admin/ModerationForms';
import { StatusTabs, statusFrom } from '@/components/admin/StatusTabs';
import { Pagination } from '@/components/layout/Pagination';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { pageNumberFrom } from '@/lib/validation/page-number';
import { listFlags } from '@/services/moderation';
import { reviewFlagAction } from '../moderation-actions';

const STATUSES = ['OPEN', 'SUSPICIOUS', 'CLEARED'] as const;

/** UC-M2 / FR-13.2: authenticity flags to inspect; appeals come first. */
export default async function AdminFlagsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['ADMIN'] });
  const t = await getTranslations('admin.flags');
  const tScore = await getTranslations('score');
  const format = await getFormatter();
  const raw = await searchParams;
  const status = statusFrom(STATUSES, raw.status);
  const result = await listFlags(getContainer(), {
    adminUserId: session.user.id,
    status,
    page: pageNumberFrom(raw.page),
  });

  return (
    <PageShell title={t('title')} intro={<AdminNav />} wide>
      <p className="text-sm">{t('intro')}</p>
      <StatusTabs
        statuses={STATUSES}
        current={status}
        basePath="/admin/flags"
        labelFor={(value) => t(`statuses.${value}`)}
      />
      {result.items.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {result.items.map((flag) => (
            <li key={flag.id}>
              <Card className="grid gap-2 p-4 text-sm">
                <p>
                  <Link
                    href={`/admin/users/${flag.creator.userId}`}
                    className="font-medium underline"
                  >
                    {flag.creator.displayName}
                  </Link>{' '}
                  · {tScore(`flags.${flag.type}`)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {format.dateTime(flag.createdAt, { dateStyle: 'medium' })} ·{' '}
                  {Object.entries(flag.details)
                    .map(([key, value]) => `${key}: ${String(value)}`)
                    .join(', ')}
                </p>
                {flag.appealText ? (
                  <p className="rounded-md bg-amber-50 px-2 py-1 text-amber-900">
                    {t('appeal', { text: flag.appealText })}
                  </p>
                ) : null}
                {flag.status === 'OPEN' ? (
                  <div className="flex flex-wrap gap-3">
                    <DecisionButton
                      action={reviewFlagAction}
                      hidden={{ flagId: flag.id, decision: 'CLEARED' }}
                      label={t('clear')}
                    />
                    <DecisionButton
                      action={reviewFlagAction}
                      hidden={{ flagId: flag.id, decision: 'SUSPICIOUS' }}
                      label={t('markSuspicious')}
                      variant="destructive"
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
        hrefFor={(page) => `/admin/flags?status=${status}&page=${page}`}
      />
    </PageShell>
  );
}
