import { getTranslations } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { signOutAction } from '@/app/[locale]/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getCurrentSession } from '@/lib/auth/current-session';
import { countUnreadMessages } from '@/services/chat';
import { countOpenRequests } from '@/services/requests';
import { LanguageSwitcher } from './LanguageSwitcher';

/** Top bar: home link, account links for the signed-in user, language choice. */
export async function SiteHeader() {
  const t = await getTranslations('nav');
  const session = await getCurrentSession();
  const isSignedIn = session !== null && session.isTwoFactorSatisfied;
  const role = isSignedIn ? session.user.role : null;
  const isParticipant = role === 'BRAND' || role === 'CREATOR';
  // FR-8.3: unread counts in the navigation.
  const unreadMessages =
    isSignedIn && isParticipant ? await countUnreadMessages(getContainer(), session.user.id) : 0;
  const openRequests =
    isSignedIn && role === 'CREATOR' ? await countOpenRequests(getContainer(), session.user.id) : 0;

  return (
    <header className="border-b print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-semibold">
          {t('home')}
        </Link>
        <nav aria-label={t('mainLabel')} className="flex flex-wrap items-center gap-3 text-sm">
          {isSignedIn ? (
            <>
              <Link href="/dashboard" className="underline-offset-4 hover:underline">
                {t('dashboard')}
              </Link>
              {session.user.role === 'CREATOR' ? (
                <>
                  <Link href="/creator/profile" className="underline-offset-4 hover:underline">
                    {t('profile')}
                  </Link>
                  <Link href="/deals" className="underline-offset-4 hover:underline">
                    {t('deals')}
                  </Link>
                  <Link href="/creator/requests" className="underline-offset-4 hover:underline">
                    {t('requests')}
                    <CountBadge
                      count={openRequests}
                      label={t('openRequests', { count: openRequests })}
                    />
                  </Link>
                  <Link href="/creator/accounts" className="underline-offset-4 hover:underline">
                    {t('accounts')}
                  </Link>
                  <Link href="/creator/analytics" className="underline-offset-4 hover:underline">
                    {t('analytics')}
                  </Link>
                </>
              ) : null}
              {session.user.role === 'BRAND' ? (
                <>
                  <Link href="/brand/search" className="underline-offset-4 hover:underline">
                    {t('search')}
                  </Link>
                  <Link href="/brand/shortlists" className="underline-offset-4 hover:underline">
                    {t('shortlists')}
                  </Link>
                  <Link href="/brand/requests" className="underline-offset-4 hover:underline">
                    {t('requests')}
                  </Link>
                  <Link href="/deals" className="underline-offset-4 hover:underline">
                    {t('deals')}
                  </Link>
                  <Link href="/brand/team" className="underline-offset-4 hover:underline">
                    {t('team')}
                  </Link>
                </>
              ) : null}
              {isParticipant ? (
                <Link href="/messages" className="underline-offset-4 hover:underline">
                  {t('messages')}
                  <CountBadge
                    count={unreadMessages}
                    label={t('unreadMessages', { count: unreadMessages })}
                  />
                </Link>
              ) : null}
              <Link href="/settings" className="underline-offset-4 hover:underline">
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
              <Link href="/sign-in" className="underline-offset-4 hover:underline">
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
    <span className="bg-primary text-primary-foreground ml-1 rounded-full px-1.5 py-0.5 text-xs">
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
