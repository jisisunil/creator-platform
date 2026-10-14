import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { DealStatusBadge } from '@/components/deals/DealDisplay';
import { Pagination } from '@/components/layout/Pagination';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { formatMoney } from '@/lib/format';
import { pageNumberFrom } from '@/lib/validation/page-number';
import { listDeals } from '@/services/deals';

/** FR-9.1: the user's deals, most recently changed first. */
export default async function DealsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND', 'CREATOR'] });
  const t = await getTranslations('deals');
  const format = await getFormatter();
  const isBrand = session.user.role === 'BRAND';
  const result = await listDeals(getContainer(), {
    userId: session.user.id,
    page: pageNumberFrom((await searchParams).page),
  });

  return (
    <PageShell title={t('title')} intro={t('intro')}>
      {isBrand ? (
        <Link href="/brand/campaigns" className="w-fit underline">
          {t('campaignsLink')}
        </Link>
      ) : null}
      {result.items.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {result.items.map((deal) => (
            <li key={deal.id}>
              <Card className="grid gap-1 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/deals/${deal.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {deal.campaignName}
                  </Link>
                  <DealStatusBadge status={deal.status} />
                </div>
                <p className="text-muted-foreground text-sm">
                  {isBrand ? deal.creatorDisplayName : deal.brandName}
                  {deal.agreedAmountMinor === null
                    ? null
                    : ` · ${formatMoney(deal.agreedAmountMinor, deal.currencyCode, locale, session.user.countryCode)}`}
                  {' · '}
                  {t('deadline', {
                    date: format.dateTime(deal.deadline, { dateStyle: 'medium', timeZone: 'UTC' }),
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
        hrefFor={(page) => `/deals?page=${page}`}
      />
    </PageShell>
  );
}
