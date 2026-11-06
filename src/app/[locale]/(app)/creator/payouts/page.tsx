import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { PayoutForm } from '@/components/creators/PayoutForm';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { requirePageSession } from '@/lib/auth/current-session';
import { getPayoutAccount } from '@/services/deals';

/** ADR-013: where the creator's escrow payouts go, and setting that up once. */
export default async function PayoutsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['CREATOR'] });
  const t = await getTranslations('payouts');
  const format = await getFormatter();
  const { isAvailable, account } = await getPayoutAccount(getContainer(), session.user.id);

  return (
    <PageShell title={t('title')} intro={t('intro')}>
      {!isAvailable ? (
        <Alert>{t('notAvailable')}</Alert>
      ) : account ? (
        <Card className="grid gap-2">
          <p className="font-medium">{t('ready', { last4: account.bankLast4 })}</p>
          <p className="text-muted-foreground text-sm">
            {t('since', { date: format.dateTime(account.createdAt, { dateStyle: 'medium' }) })}
          </p>
          <p className="text-muted-foreground text-sm">{t('change')}</p>
        </Card>
      ) : (
        <Card>
          <PayoutForm />
        </Card>
      )}
    </PageShell>
  );
}
