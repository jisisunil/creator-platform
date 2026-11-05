import { getTranslations } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { signOutAction } from '@/app/[locale]/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getCurrentSession } from '@/lib/auth/current-session';
import { countUnreadMessages } from '@/services/chat';
import { countUnreadNotifications } from '@/services/notifications';
import { countOpenRequests } from '@/services/requests';
import { LanguageSwitcher } from './LanguageSwitcher';

/** Top bar: home link, account links for the signed-in user, language choice. */
export async function SiteHeader() {
  const t = await getTranslations('nav');
  const tMeta = await getTranslations('metadata');
  const session = await getCurrentSession();
  const isSignedIn = session !== null && session.isTwoFactorSatisfied;
  const role = isSignedIn ? session.user.role : null;
  const isParticipant = role === 'BRAND' || role === 'CREATOR';
  // FR-8.3: unread counts in the navigation.
  const unreadMessages =
    isSignedIn && isParticipant ? await countUnreadMessages(getContainer(), session.user.id) : 0;
  const unreadNotifications =
    isSignedIn && isParticipant
      ? await countUnreadNotifications(getContainer(), session.user.id)
      : 0;
  const openRequests =
    isSignedIn && role === 'CREATOR' ? await countOpenRequests(getContainer(), session.user.id) : 0;

  return (
    <header className="bg-background border-b print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4">
        {/* Wordmark until the product name and logo are chosen (X-07). */}
        <Link href="/" aria-label={t('home')} className="font-serif text-2xl leading-none">
          {tMeta('title')}
          <span aria-hidden="true" className="text-brand">
            .
          </span>
        </Link>
        <nav
          aria-label={t('mainLabel')}
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
        >
          {isSignedIn ? (
            <>
              <Link
                href="/dashboard"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('dashboard')}
              </Link>
              {session.user.role === 'CREATOR' ? (
                <>
                  <Link
                    href="/creator/profile"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('profile')}
                  </Link>
                  <Link
                    href="/deals"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('deals')}
                  </Link>
                  <Link
                    href="/creator/requests"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('requests')}
                    <CountBadge
                      count={openRequests}
                      label={t('openRequests', { count: openRequests })}
                    />
                  </Link>
                  <Link
                    href="/creator/accounts"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('accounts')}
                  </Link>
                  <Link
                    href="/creator/analytics"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('analytics')}
                  </Link>
                </>
              ) : null}
              {session.user.role === 'BRAND' ? (
                <>
                  <Link
                    href="/brand/search"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('search')}
                  </Link>
                  <Link
                    href="/brand/shortlists"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('shortlists')}
                  </Link>
                  <Link
                    href="/brand/requests"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('requests')}
                  </Link>
                  <Link
                    href="/deals"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('deals')}
                  </Link>
                  <Link
                    href="/brand/team"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('team')}
                  </Link>
                </>
              ) : null}
              {role === 'ADMIN' ? (
                <Link
                  href="/admin"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('admin')}
                </Link>
              ) : null}
              {isParticipant ? (
                <Link
                  href="/messages"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('messages')}
                  <CountBadge
                    count={unreadMessages}
                    label={t('unreadMessages', { count: unreadMessages })}
                  />
                </Link>
              ) : null}
              {isParticipant ? (
                <Link
                  href="/notifications"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('notifications')}
                  <CountBadge
                    count={unreadNotifications}
                    label={t('unreadNotifications', { count: unreadNotifications })}
                  />
                </Link>
              ) : null}
              <Link
                href="/settings"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('settings')}
              </Link>
              <form action={signOutAction}>
                <Button type="submit" variant="outline" size="sm">
                  {t('signOut')}
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('signIn')}
              </Link>
              <Button asChild size="sm">
                <Link href="/sign-up">{t('signUp')}</Link>
              </Button>
            </>
          )}
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}

/** A small count after a navigation link; the label is read by screen readers. */
function CountBadge({ count, label }: { count: number; label: string }) {
  if (count === 0) return null;
  return (
    <span className="bg-brand text-brand-foreground ml-1 rounded-full px-1.5 py-0.5 text-xs tabular-nums">
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
