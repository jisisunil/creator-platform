import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { Pagination } from '@/components/layout/Pagination';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { pageNumberFrom } from '@/lib/validation/page-number';
import { listChats } from '@/services/chat';

/** FR-8.3: the user's chats, most recent first, with unread counts. */
export default async function MessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND', 'CREATOR'] });
  const t = await getTranslations('chat');
  const format = await getFormatter();
  const result = await listChats(getContainer(), {
    userId: session.user.id,
    page: pageNumberFrom((await searchParams).page),
  });

  return (
    <PageShell title={t('title')} intro={t('intro')}>
      {result.items.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {result.items.map((chat) => (
            <li key={chat.id}>
              <Card className="grid gap-1 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/messages/${chat.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {chat.otherPartyName}
                  </Link>
                  {chat.unreadCount > 0 ? (
                    <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                      {t('unread', { count: chat.unreadCount })}
                    </span>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-sm">
                  {chat.campaignName}
                  {' · '}
                  {chat.lastMessageAt
                    ? t('lastActive', {
                        date: format.dateTime(chat.lastMessageAt, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }),
                      })
                    : t('noMessagesYet')}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        hrefFor={(page) => `/messages?page=${page}`}
      />
    </PageShell>
  );
}
