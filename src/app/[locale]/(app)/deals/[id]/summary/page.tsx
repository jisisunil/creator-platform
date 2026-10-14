import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { PrintButton } from '@/components/deals/DealForms';
import { PageShell } from '@/components/layout/PageShell';
import { isDomainError } from '@/domain/errors';
import { requirePageSession } from '@/lib/auth/current-session';
import { formatMoney } from '@/lib/format';
import { type DealView, getDeal } from '@/services/deals';

/**
 * FR-9.4: a printable summary of the deal (parties, deliverables, amount, dates) to keep
 * as an informal contract; "Print" can also save it as a PDF. No contact details (SR-12).
 */
export default async function DealSummaryPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND', 'CREATOR'] });
  const t = await getTranslations('deals.summary');
  const tStatus = await getTranslations('deals.status');
  const tTerms = await getTranslations('requests.terms');
  const tDealTerms = await getTranslations('deals.terms');
  const tDeliverables = await getTranslations('deliverables');
  const tRights = await getTranslations('requests.usageRights');
  const format = await getFormatter();
  const container = getContainer();

  let deal: DealView;
  try {
    deal = await getDeal(container, { userId: session.user.id, dealId: id });
  } catch (error) {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const date = (value: Date | null, timeZone?: string) =>
    value ? format.dateTime(value, { dateStyle: 'long', timeZone }) : t('notYet');
  const money = (amountMinor: number) =>
    formatMoney(amountMinor, deal.currencyCode, locale, session.user.countryCode);
  const profileUrl = new URL(`/c/${deal.creatorSlug}`, container.appUrl).toString();

  const rows: readonly [string, string][] = [
    [t('brand'), deal.brandName],
    [t('creator'), `${deal.creatorDisplayName} (${profileUrl})`],
    [t('campaign'), deal.campaignName],
    [t('status'), tStatus(deal.status)],
    [
      t('deliverables'),
      deal.deliverables
        .map((line) =>
          tTerms('deliverableLine', {
            quantity: line.quantity,
            deliverable: tDeliverables(line.deliverable),
          }),
        )
        .join(', '),
    ],
    [t('usageRights'), tRights(deal.usageRights)],
    [t('amount'), deal.agreedAmountMinor === null ? t('notAgreed') : money(deal.agreedAmountMinor)],
    [
      t('paymentTerms'),
      deal.payment && deal.advancePercent
        ? tDealTerms('splitValue', {
            percent: deal.advancePercent,
            advance: money(deal.payment.advanceMinor),
            balance: money(deal.payment.balanceMinor),
          })
        : t('fullOnCompletion'),
    ],
    [t('accepted'), date(deal.createdAt)],
    [t('contentDeadline'), date(deal.deadline, 'UTC')],
    [t('paymentDue'), date(deal.paymentDueAt)],
    [t('posted'), date(deal.postedAt)],
    [t('paid'), date(deal.paymentMarkedAt)],
    [t('completed'), date(deal.completedAt)],
  ];

  return (
    <PageShell title={t('title')} intro={t('generated', { date: date(new Date()) })}>
      <PrintButton />
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-medium">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="grid gap-1 text-sm">
        <h2 className="font-medium">{t('brief')}</h2>
        <p className="whitespace-pre-line">{deal.brief}</p>
      </section>
      {deal.posts.length > 0 ? (
        <section className="grid gap-1 text-sm">
          <h2 className="font-medium">{t('posts')}</h2>
          <ul className="list-disc pl-5">
            {deal.posts.map((post) => (
              <li key={post.id} className="break-all">
                {post.url}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-sm">{t('disclosure')}</p>
      <p className="text-muted-foreground text-xs">{t('disclaimer')}</p>
    </PageShell>
  );
}
