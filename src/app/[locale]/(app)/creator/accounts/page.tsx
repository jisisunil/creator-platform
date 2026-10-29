import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { requirePageSession } from '@/lib/auth/current-session';
import { getOwnProfile } from '@/services/creators';
import { SELF_REPORTED_PLATFORMS } from '@/config/creators';
import { DisconnectButton, LinkChannelForm, SelfReportedInstagramForm } from './AccountForms';

const RESULTS = [
  'connected',
  'disputed',
  'personal-account',
  'no-accounts',
  'expired',
  'failed',
  'self-reported',
] as const;
type Result = (typeof RESULTS)[number];

/** FR-3 / UC-C2..C5: connected accounts and ways to connect more. */
export default async function CreatorAccountsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['CREATOR'] });
  const profile = await getOwnProfile(getContainer(), session.user);
  const { result } = await searchParams;
  const t = await getTranslations('creator.accounts');
  const tPlatforms = await getTranslations('platforms');
  const format = await getFormatter();
  const shownResult = RESULTS.find((candidate): candidate is Result => candidate === result);
  // Q-43: offered only while allowed, and only to creators with no Instagram account yet.
  const canSelfReportInstagram =
    SELF_REPORTED_PLATFORMS.includes('INSTAGRAM') &&
    !profile.accounts.some((account) => account.platform === 'INSTAGRAM');

  return (
    <PageShell title={t('title')} intro={t('intro')}>
      {shownResult ? (
        <Alert
          variant={
            shownResult === 'connected' || shownResult === 'self-reported' ? 'success' : 'default'
          }
        >
          {t(`results.${shownResult}`)}
        </Alert>
      ) : null}

      <Card>
        {profile.accounts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        ) : (
          <ul className="grid gap-4">
            {profile.accounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <p className="font-medium">
                    {tPlatforms(account.platform)} · {account.handle}{' '}
                    <span className="text-muted-foreground text-xs font-normal">
                      (
                      {account.isSelfReported
                        ? t('selfReportedLabel')
                        : account.isVerified
                          ? t('verified')
                          : t('unverified')}
                      )
                    </span>
                  </p>
                  {account.isSelfReported ? (
                    <p className="text-muted-foreground text-xs">{t('selfReportedExplained')}</p>
                  ) : (
                    <>
                      <p className="text-muted-foreground text-sm">
                        {t(`status.${account.status}`)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {account.lastRefreshedAt
                          ? t('lastUpdated', {
                              date: format.dateTime(account.lastRefreshedAt, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              }),
                            })
                          : t('neverUpdated')}
                      </p>
                    </>
                  )}
                </div>
                <DisconnectButton accountId={account.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>{t('connectTitle')}</CardTitle>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <form method="post" action="/api/social/youtube/start">
            <Button type="submit" className="w-full">
              {t('connectYouTube')}
            </Button>
          </form>
          <form method="post" action="/api/social/instagram/start" className="grid gap-1">
            <Button type="submit" className="w-full">
              {t('connectInstagram')}
            </Button>
            <p className="text-muted-foreground text-xs">{t('instagramNote')}</p>
          </form>
        </div>
      </Card>

      {canSelfReportInstagram ? (
        <Card>
          <CardTitle>{t('selfReportedTitle')}</CardTitle>
          <CardDescription>{t('selfReportedHint')}</CardDescription>
          <div className="mt-4">
            <SelfReportedInstagramForm />
          </div>
        </Card>
      ) : null}

      <Card>
        <CardTitle>{t('linkTitle')}</CardTitle>
        <CardDescription>{t('linkHint')}</CardDescription>
        <div className="mt-4">
          <LinkChannelForm />
        </div>
      </Card>
    </PageShell>
  );
}
