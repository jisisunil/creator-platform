import { getFormatter, getTranslations } from 'next-intl/server';
import { Card, CardTitle } from '@/components/ui/card';
import { DEAL_STEPS, type DealStatus } from '@/domain/deals';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DealEventRecord, DealPostRecord } from '@/services/deals';

const STATUS_STYLES: Readonly<Record<DealStatus, string>> = {
  ACCEPTED: 'border-blue-700/30 bg-blue-50 text-blue-900',
  CONTENT_SUBMITTED: 'border-blue-700/30 bg-blue-50 text-blue-900',
  POSTED: 'border-violet-700/30 bg-violet-50 text-violet-900',
  PAYMENT_MARKED: 'border-amber-700/30 bg-amber-50 text-amber-900',
  COMPLETED: 'border-green-700/30 bg-green-50 text-green-900',
  CANCELLED: 'border-zinc-400 bg-zinc-50 text-zinc-800',
};

/** A deal's status as a labelled badge (text, not colour alone: NFR-9). */
export async function DealStatusBadge({ status }: { status: DealStatus }) {
  const t = await getTranslations('deals.status');
  return (
    <span
      className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_STYLES[status])}
    >
      {t(status)}
    </span>
  );
}

/** FR-9.1: where the deal is on its way to completion. */
export async function DealProgress({ status }: { status: DealStatus }) {
  const t = await getTranslations('deals.status');
  const tDeals = await getTranslations('deals');
  const currentIndex = DEAL_STEPS.indexOf(status);
  return (
    <ol aria-label={tDeals('progressLabel')} className="grid gap-2 sm:grid-cols-5">
      {DEAL_STEPS.map((step, index) => {
        const isDone = currentIndex >= index;
        return (
          <li
            key={step}
            aria-current={index === currentIndex ? 'step' : undefined}
            className={cn(
              'rounded-md border px-2 py-1 text-xs',
              isDone ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground',
            )}
          >
            <span className="sr-only">{isDone ? tDeals('stepDone') : tDeals('stepTodo')}</span>
            {t(step)}
          </li>
        );
      })}
    </ol>
  );
}

/** UC-R6: the deal's posts with their latest stats; deleted and private posts are marked. */
export async function DealPosts({
  posts,
  locale,
  countryCode,
}: {
  posts: readonly DealPostRecord[];
  locale: string;
  countryCode: string;
}) {
  const t = await getTranslations('deals.posts');
  const tPlatforms = await getTranslations('platforms');
  const format = await getFormatter();
  if (posts.length === 0) return <p className="text-muted-foreground text-sm">{t('none')}</p>;
  const count = (value: number) => formatCount(value, locale, countryCode);
  return (
    <ul className="grid gap-3">
      {posts.map((post) => (
        <li key={post.id} className="grid gap-1 text-sm">
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all underline"
          >
            {tPlatforms(post.platform)}: {post.url}
          </a>
          <p>
            {post.views === null
              ? t('statsNoViews', { likes: count(post.likes), comments: count(post.comments) })
              : t('stats', {
                  views: count(post.views),
                  likes: count(post.likes),
                  comments: count(post.comments),
                })}
          </p>
          <p className="text-muted-foreground text-xs">
            {post.status === 'LIVE' ? null : `${t(`status.${post.status}`)} · `}
            {post.statsFetchedAt
              ? t('updated', {
                  date: format.dateTime(post.statsFetchedAt, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })
              : null}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** FR-9.1: the deal's history, oldest first. */
export async function DealHistory({ events }: { events: readonly DealEventRecord[] }) {
  const t = await getTranslations('deals.history');
  const format = await getFormatter();
  return (
    <Card className="grid gap-3">
      <CardTitle>{t('title')}</CardTitle>
      <ol className="grid gap-2 text-sm">
        {events.map((event) => (
          <li key={event.id}>
            <time dateTime={event.createdAt.toISOString()} className="text-muted-foreground mr-2">
              {format.dateTime(event.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
            </time>
            {t(`events.${event.kind}`, { side: event.actorSide ?? 'SYSTEM' })}
            {event.note && event.kind !== 'POST_ADDED' ? (
              <span className="text-muted-foreground"> · {event.note}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
