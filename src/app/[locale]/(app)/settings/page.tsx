import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { getConsentHistory, getConsentStatus } from '@/services/consent';
import { signOutEverywhereAction } from './actions';
import { getNotificationPreferences } from '@/services/notifications';
import {
  ChangeEmailForm,
  ChangePasswordForm,
  MarketingConsentForm,
  NotificationPreferencesForm,
} from './SettingsForms';

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale);
  const t = await getTranslations('settings');
  const format = await getFormatter();
  const container = getContainer();
  const [consent, history, notificationPreferences] = await Promise.all([
    getConsentStatus(container, session.user),
    getConsentHistory(container, session.user.id),
    getNotificationPreferences(container, session.user),
  ]);
  const hasPassword = session.user.passwordHash !== null;

  return (
    <PageShell title={t('title')}>
      <Card>
        <CardTitle>{t('account')}</CardTitle>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t('nameLabel')}</dt>
          <dd>{session.user.name}</dd>
          <dt className="text-muted-foreground">{t('emailLabel')}</dt>
          <dd className="break-all">{session.user.email}</dd>
        </dl>
      </Card>

      <Card>
        <CardTitle>{t('changeEmail.title')}</CardTitle>
        <div className="mt-4">
          <ChangeEmailForm hasPassword={hasPassword} />
        </div>
      </Card>

      <Card>
        <CardTitle>{t('changePassword.title')}</CardTitle>
        <div className="mt-4">
          <ChangePasswordForm hasPassword={hasPassword} />
        </div>
      </Card>

      {notificationPreferences.length > 0 ? (
        <Card>
          <CardTitle>{t('notifications.title')}</CardTitle>
          <CardDescription>{t('notifications.intro')}</CardDescription>
          <div className="mt-4">
            <NotificationPreferencesForm preferences={notificationPreferences} />
          </div>
        </Card>
      ) : null}

      <Card>
        <CardTitle>{t('sessions.title')}</CardTitle>
        <CardDescription>{t('sessions.intro')}</CardDescription>
        <form action={signOutEverywhereAction} className="mt-4">
          <Button type="submit" variant="destructive">
            {t('sessions.signOutEverywhere')}
          </Button>
        </form>
      </Card>

      <Card>
        <CardTitle>{t('privacy.title')}</CardTitle>
        <CardDescription>{t('privacy.marketingLabel')}</CardDescription>
        <div className="mt-4">
          <MarketingConsentForm isGranted={consent.hasMarketingConsent} />
        </div>
        <h3 className="mt-6 font-medium">{t('privacy.historyTitle')}</h3>
        <ul className="mt-2 grid gap-1 text-sm">
          {history.map((entry) => (
            <li key={`${entry.kind}-${entry.createdAt.toISOString()}`}>
              {format.dateTime(entry.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
              {' · '}
              {t(`privacy.kind.${entry.kind}`)}
              {' · '}
              {entry.isGranted ? t('privacy.granted') : t('privacy.withdrawn')}
              {' · '}
              {t('privacy.version', { version: entry.noticeVersion })}
            </li>
          ))}
        </ul>
        <Link href="/privacy" className="mt-4 inline-block text-sm underline">
          {t('privacy.noticeLink')}
        </Link>
      </Card>
    </PageShell>
  );
}
