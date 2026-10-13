import { getTranslations } from 'next-intl/server';
import { signOutAction } from '@/app/[locale]/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getCurrentSession } from '@/lib/auth/current-session';
import { LanguageSwitcher } from './LanguageSwitcher';

/** Top bar: home link, account links for the signed-in user, language choice. */
export async function SiteHeader() {
  const t = await getTranslations('nav');
  const session = await getCurrentSession();
  const isSignedIn = session !== null && session.isTwoFactorSatisfied;

  return (
    <header className="border-b">
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
              {session.user.role === 'BRAND' ? (
                <Link href="/brand/team" className="underline-offset-4 hover:underline">
                  {t('team')}
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
