import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { Pagination } from '@/components/layout/Pagination';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { cn } from '@/lib/utils';
import { pageNumberFrom } from '@/lib/validation/page-number';
import { isNotificationKind, listNotifications } from '@/services/notifications';

/** FR-12.1: the user's notifications, newest first; new ones are marked as such. */
export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND', 'CREATOR'] });
  const t = await getTranslations('notifications');
  const format = await getFormatter();
  const result = await listNotifications(getContainer(), {
    userId: session.user.id,
    page: pageNumberFrom((await searchParams).page),
  });
  const items = result.items.filter((item) => isNotificationKind(item.kind));

  return (
    <PageShell
      title={t('title')}
      intro={
        <Link href="/settings" className="underline">
          {t('settingsLink')}
        </Link>
      }
    >
      {items.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        </Card>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => {
            const isNew = item.readAt === null;
            return (
              <li key={item.id}>
                <Card className={cn('grid gap-1 p-4', isNew && 'border-primary')}>
                  <Link href={item.path} className="text-sm underline-offset-4 hover:underline">
                    {isNew ? <span className="mr-2 font-semibold">{t('new')}</span> : null}
                    {isNotificationKind(item.kind) ? t(`kinds.${item.kind}`, item.params) : null}
                  </Link>
                  <time
                    dateTime={item.createdAt.toISOString()}
                    className="text-muted-foreground text-xs"
                  >
                    {format.dateTime(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </time>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        hrefFor={(page) => `/notifications?page=${page}`}
      />
    </PageShell>
  );
}
