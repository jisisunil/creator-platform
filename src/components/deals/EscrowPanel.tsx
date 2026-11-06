import { getFormatter, getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { formatMoney } from '@/lib/format';
import type { DealView } from '@/services/deals';
import { FundEscrowButton } from './FundEscrowButton';

/**
 * ADR-013: where the money is for an escrow deal: what the brand will pay, held, released
 * or refunded; and the next step for this side (payout setup, funding).
 */
export async function EscrowPanel({
  deal,
  locale,
  countryCode,
}: {
  deal: DealView;
  locale: string;
  countryCode: string;
}) {
  const t = await getTranslations('deals.escrow');
  const format = await getFormatter();
  const escrow = deal.escrow;
  if (!escrow) return null;
  const money = (amountMinor: number) =>
    formatMoney(amountMinor, deal.currencyCode, locale, countryCode);
  const payment = escrow.payment;
  const status = payment?.status ?? 'AWAITING_PAYMENT';
  const isBrand = deal.viewerSide === 'BRAND';
  const canFund = deal.allowedActions.includes('FUND_ESCROW');
  const isOpen = deal.status !== 'CANCELLED' && deal.status !== 'COMPLETED';
  const changedAt = payment ? (payment.releasedAt ?? payment.refundedAt ?? payment.fundedAt) : null;

  return (
    <Card className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{t('title')}</CardTitle>
        <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
          {t(`status.${status}`)}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">{t('explain')}</p>

      {status === 'AWAITING_PAYMENT' && isOpen ? (
        <>
          {!escrow.hasPayoutAccount ? (
            isBrand ? (
              <p className="text-sm">{t('waitingForPayout')}</p>
            ) : (
              <div className="grid gap-2">
                <p className="text-sm">{t('setUpPayout')}</p>
                <Button asChild variant="outline" className="w-fit">
                  <Link href="/creator/payouts">{t('setUpPayoutLink')}</Link>
                </Button>
              </div>
            )
          ) : null}
          {canFund && escrow.charge && deal.agreedAmountMinor !== null ? (
            <div className="grid gap-2">
              <p className="text-sm">
                {t('breakdown', {
                  amount: money(deal.agreedAmountMinor),
                  fee: money(escrow.charge.feeMinor),
                  total: money(escrow.charge.chargedMinor),
                })}
              </p>
              <p className="text-muted-foreground text-xs">{t('feeNote')}</p>
              <FundEscrowButton
                dealId={deal.id}
                campaignName={deal.campaignName}
                totalLabel={money(escrow.charge.chargedMinor)}
              />
            </div>
          ) : null}
          {!isBrand && escrow.hasPayoutAccount ? (
            <p className="text-sm">{t('waitingForFunding')}</p>
          ) : null}
          {isBrand && escrow.hasPayoutAccount && !canFund ? (
            <p className="text-sm">{t('fundAfterContract')}</p>
          ) : null}
        </>
      ) : null}

      {payment && changedAt && status !== 'AWAITING_PAYMENT' ? (
        <p className="text-sm">
          {t(`detail.${status}`, {
            amount: money(payment.amountMinor),
            date: format.dateTime(changedAt, { dateStyle: 'medium' }),
          })}
        </p>
      ) : null}
      {payment?.isFrozen ? <Alert>{t('frozen')}</Alert> : null}
    </Card>
  );
}
