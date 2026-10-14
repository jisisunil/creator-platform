import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { AdminNav } from '@/components/admin/AdminNav';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { isDomainError } from '@/domain/errors';
import { requirePageSession } from '@/lib/auth/current-session';
import { type ChatReview, getChatForReview } from '@/services/moderation';

/**
 * SEC-11: a chat opened by an admin with a logged reason; read only, for an hour.
 * Attachments are listed by name only.
 */
export default async function AdminChatReviewPage({
  params,
}: {
  params: Promise<{ locale: string; grantId: string }>;
}) {
  const { locale, grantId } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['ADMIN'] });
  const t = await getTranslations('admin.chat');
  const format = await getFormatter();

  let chat: ChatReview;
  try {
    chat = await getChatForReview(getContainer(), { adminUserId: session.user.id, grantId });
  } catch (error) {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  return (
    <PageShell
      title={t('title', { brand: chat.brandName, creator: chat.creatorDisplayName })}
      intro={<AdminNav />}
      wide
    >
      <Alert>
        {t('logged', {
          reason: chat.reason,
          time: format.dateTime(chat.expiresAt, { timeStyle: 'short' }),
        })}
      </Alert>
      <Card className="grid gap-3 p-4">
        <p className="text-sm font-medium">{chat.campaignName}</p>
        <ol className="grid gap-2 text-sm">
          {chat.messages.map((message) => (
            <li key={message.id} className="rounded-md border px-3 py-2">
              <p className="text-muted-foreground text-xs">
                {message.senderSide === 'BRAND' ? chat.brandName : chat.creatorDisplayName}
                {message.senderName === null ? ` (${t('deletedUser')})` : ''}
                {' · '}
                {format.dateTime(message.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
              </p>
              <p className="break-words whitespace-pre-line">{message.body}</p>
              {message.attachment ? (
                <p className="text-muted-foreground text-xs">
                  {t('attachment', { name: message.attachment.fileName })}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>
    </PageShell>
  );
}
