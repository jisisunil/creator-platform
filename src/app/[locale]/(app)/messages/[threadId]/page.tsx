import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { setCreatorBlockedAction } from '@/app/[locale]/(app)/brand/requests/actions';
import { setBrandBlockedAction } from '@/app/[locale]/(app)/creator/requests/actions';
import { AutoRefresh, MessageComposer, ReportForm } from '@/components/chat/ChatForms';
import { PageShell } from '@/components/layout/PageShell';
import { BlockToggleForm } from '@/components/requests/RequestForms';
import { Alert } from '@/components/ui/alert';
import { Card, CardTitle } from '@/components/ui/card';
import { getContainer } from '@/adapters/container';
import { CHAT_LIMITS } from '@/config/collaboration';
import { isDomainError } from '@/domain/errors';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { fileUrlFor } from '@/lib/file-url';
import { cn } from '@/lib/utils';
import { type ChatView, getChat } from '@/services/chat';

const BYTES_PER_KB = 1024;

/** FR-8 / UC-R3: one chat, oldest message first, with the composer at the bottom. */
export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; threadId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, threadId } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND', 'CREATOR'] });
  const t = await getTranslations('chat');
  const format = await getFormatter();
  const before = (await searchParams).before;

  let chat: ChatView;
  try {
    chat = await getChat(getContainer(), {
      userId: session.user.id,
      threadId,
      beforeMessageId: typeof before === 'string' ? before : undefined,
    });
  } catch (error) {
    // SEC-2: someone else's chat looks like it doesn't exist.
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const isViewingLatest = typeof before !== 'string';
  const requestPath =
    chat.viewerSide === 'BRAND'
      ? `/brand/requests/${chat.requestId}`
      : `/creator/requests/${chat.requestId}`;
  const oldestId = chat.messages[0]?.id;

  return (
    <PageShell
      title={chat.otherPartyName}
      intro={
        <Link href={requestPath} className="underline">
          {chat.campaignName}
        </Link>
      }
    >
      {isViewingLatest && !chat.closedReason ? (
        <AutoRefresh intervalMs={CHAT_LIMITS.refreshIntervalMs} />
      ) : null}
      <Card className="grid gap-4 p-4">
        {chat.hasOlder && oldestId ? (
          <Link href={`/messages/${chat.id}?before=${oldestId}`} className="text-sm underline">
            {t('olderMessages')}
          </Link>
        ) : null}
        {chat.messages.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('startHint')}</p>
        ) : (
          <ol aria-label={t('messagesLabel')} className="grid gap-3">
            {chat.messages.map((message) => {
              const author = message.isMine
                ? t('you')
                : message.senderName === null
                  ? t('deletedUser')
                  : chat.otherPartyName;
              const fileUrl = message.attachment ? fileUrlFor(message.attachment.storageKey) : null;
              return (
                <li
                  key={message.id}
                  className={cn(
                    'grid max-w-[85%] gap-1 rounded-lg border px-3 py-2 text-sm',
                    message.isMine ? 'bg-primary/5 justify-self-end' : 'bg-card justify-self-start',
                  )}
                >
                  <p className="text-muted-foreground text-xs">
                    {author}
                    {' · '}
                    <time dateTime={message.createdAt.toISOString()}>
                      {format.dateTime(message.createdAt, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </time>
                  </p>
                  {message.body ? (
                    <p className="break-words whitespace-pre-line">{message.body}</p>
                  ) : null}
                  {message.attachment && fileUrl ? (
                    message.attachment.contentType.startsWith('image/') ? (
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                        {/* Signed, expiring URL for a private, scanned upload (SR-9). */}
                        <Image
                          src={fileUrl}
                          alt={message.attachment.fileName}
                          width={320}
                          height={240}
                          unoptimized
                          className="h-auto max-h-60 w-auto rounded-md object-contain"
                        />
                      </a>
                    ) : (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {t('file', {
                          name: message.attachment.fileName,
                          sizeKb: Math.ceil(message.attachment.sizeBytes / BYTES_PER_KB),
                        })}
                      </a>
                    )
                  ) : null}
                  {message.contactFlags.length > 0 ? (
                    <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
                      {t('safetyNote', {
                        kinds: message.contactFlags.map((flag) => t(`flags.${flag}`)).join(', '),
                      })}
                    </p>
                  ) : null}
                  {message.isMine && message.isSeen ? (
                    <p className="text-muted-foreground text-right text-xs">{t('seen')}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        {!isViewingLatest ? (
          <Link href={`/messages/${chat.id}`} className="text-sm underline">
            {t('newestMessages')}
          </Link>
        ) : null}
      </Card>

      {chat.closedReason ? (
        <Alert>
          {chat.closedReason === 'BLOCKED' ? t('closedBlocked') : t('closedUnavailable')}
        </Alert>
      ) : (
        <Card>
          <p className="text-muted-foreground mb-3 text-xs">{t('paymentNote')}</p>
          <MessageComposer threadId={chat.id} />
        </Card>
      )}

      <Card className="grid gap-6">
        <CardTitle>{t('safetyTitle')}</CardTitle>
        <ReportForm threadId={chat.id} otherPartyName={chat.otherPartyName} />
        <BlockToggleForm
          action={chat.viewerSide === 'BRAND' ? setCreatorBlockedAction : setBrandBlockedAction}
          requestId={chat.requestId}
          isBlocked={chat.isBlockedByViewer}
          otherPartyName={chat.otherPartyName}
        />
      </Card>
    </PageShell>
  );
}
