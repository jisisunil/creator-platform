import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { requirePageSession } from '@/lib/auth/current-session';
import { getPendingChoices } from '@/services/social';
import { ChooseAccountButton } from '../AccountForms';

/** UC-C2: one Google account owns several channels; the creator picks one. */
export default async function ChooseAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ pending?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['CREATOR'] });
  const { pending } = await searchParams;
  const t = await getTranslations('creator.accounts');
  const choices = pending
    ? await getPendingChoices(getContainer(), { userId: session.user.id, pendingId: pending })
    : null;

  return (
    <PageShell narrow title={t('chooseTitle')} intro={t('chooseIntro')}>
      {!choices || !pending ? (
        <Alert>{t('results.expired')}</Alert>
      ) : (
        <Card>
          <ul className="grid gap-3">
            {choices.accounts.map((account) => (
              <li key={account.externalId} className="flex items-center justify-between gap-3">
                <span>
                  <span className="font-medium">{account.displayName}</span>{' '}
                  <span className="text-muted-foreground text-sm">{account.handle}</span>
                </span>
                <ChooseAccountButton pendingId={pending} externalId={account.externalId} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </PageShell>
  );
}
