import { getFormatter, getTranslations } from 'next-intl/server';
import { Card, CardTitle } from '@/components/ui/card';
import type { CollabRequestStatus, DeliverableLine, UsageRights } from '@/domain/requests';
import { Link } from '@/i18n/navigation';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { RequestSummary } from '@/services/requests';

const STATUS_STYLES: Readonly<Record<CollabRequestStatus, string>> = {
  OPEN: 'border-blue-700/30 bg-blue-50 text-blue-900',
  ACCEPTED: 'border-green-700/30 bg-green-50 text-green-900',
  DECLINED: 'border-zinc-400 bg-zinc-50 text-zinc-800',
  EXPIRED: 'border-zinc-400 bg-zinc-50 text-zinc-800',
  WITHDRAWN: 'border-zinc-400 bg-zinc-50 text-zinc-800',
};

/** A request's status as a labelled badge (text, not colour alone: NFR-9). */
export async function RequestStatusBadge({ status }: { status: CollabRequestStatus }) {
  const t = await getTranslations('requests.status');
  return (
    <span
      className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_STYLES[status])}
    >
      {t(status)}
    </span>
  );
}

/** The terms of a request: brief, deliverables, budget, deadline and usage rights (FR-7.1). */
export async function RequestTerms({
  request,
  locale,
  countryCode,
}: {
  request: {
    readonly campaignName: string;
    readonly brief: string;
    readonly deliverables: readonly DeliverableLine[];
    readonly budgetMinor: number | null;
    readonly currencyCode: string;
    readonly deadline: Date;
    readonly usageRights: UsageRights;
  };
  locale: string;
  countryCode: string;
}) {
  const t = await getTranslations('requests.terms');
  const tDeliverables = await getTranslations('deliverables');
  const tRights = await getTranslations('requests.usageRights');
  const format = await getFormatter();
  return (
    <Card className="grid gap-4">
      <CardTitle>{request.campaignName}</CardTitle>
      <div>
        <h3 className="text-sm font-medium">{t('brief')}</h3>
        {/* Plain text: React escapes it, and line breaks are kept with CSS. */}
        <p className="mt-1 text-sm whitespace-pre-line">{request.brief}</p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium">{t('deliverables')}</dt>
          <dd>
            <ul>
              {request.deliverables.map((line) => (
                <li key={line.deliverable}>
                  {t('deliverableLine', {
                    quantity: line.quantity,
                    deliverable: tDeliverables(line.deliverable),
                  })}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="font-medium">{t('budget')}</dt>
          <dd>
            {request.budgetMinor === null
              ? t('noBudget')
              : formatMoney(request.budgetMinor, request.currencyCode, locale, countryCode)}
          </dd>
        </div>
        <div>
          <dt className="font-medium">{t('deadline')}</dt>
          <dd>{format.dateTime(request.deadline, { dateStyle: 'medium', timeZone: 'UTC' })}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('usageRights')}</dt>
          <dd>{tRights(request.usageRights)}</dd>
        </div>
      </dl>
    </Card>
  );
}

/** A list of requests linking to `basePath/<id>`; the other party's name is shown. */
export async function RequestList({
  items,
  basePath,
  showCreator,
}: {
  items: readonly RequestSummary[];
  basePath: '/brand/requests' | '/creator/requests';
  /** Brands see who they asked; creators see which brand asked. */
  showCreator: boolean;
}) {
  const t = await getTranslations('requests.list');
  const format = await getFormatter();
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <Card className="grid gap-1 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`${basePath}/${item.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {item.campaignName}
              </Link>
              <RequestStatusBadge status={item.status} />
            </div>
            <p className="text-muted-foreground text-sm">
              {t(showCreator ? 'toCreator' : 'fromBrand', {
                name: showCreator ? item.creatorDisplayName : item.brandName,
                date: format.dateTime(item.createdAt, { dateStyle: 'medium' }),
              })}
            </p>
            {item.status === 'OPEN' ? (
              <p className="text-muted-foreground text-xs">
                {t('expires', { date: format.dateTime(item.expiresAt, { dateStyle: 'medium' }) })}
              </p>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}
