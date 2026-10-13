import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { cookies } from 'next/headers';
import { getContainer } from '@/adapters/container';
import { getServerEnv, isGoogleSignInEnabled } from '@/config/env';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/config/locales';
import { resolveGoogleSignIn } from '@/services/accounts';
import { getLogger } from '../logger';
import { getRequestInfo } from '../request-info';
import {
  clearPendingGoogleState,
  readPendingGoogleSignUp,
  savePendingGoogleLink,
} from './pending-oauth';
import { writeSessionCookie } from './session-cookie';

const logger = getLogger('google-sign-in');

async function currentLocale(): Promise<string> {
  const store = await cookies();
  const locale = store.get('NEXT_LOCALE')?.value;
  return locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? locale
    : DEFAULT_LOCALE;
}

/**
 * Auth.js only runs the Google OAuth handshake (ADR-003). The signIn callback hands the
 * verified profile to the accounts service, which opens our own session, and then always
 * returns a redirect URL so Auth.js never creates a session or user of its own.
 */
export const { handlers, signIn: startGoogleOAuth } = NextAuth(() => {
  const env = getServerEnv();
  return {
    secret: env.AUTH_SECRET,
    trustHost: true,
    providers: isGoogleSignInEnabled(env)
      ? [
          Google({
            clientId: env.AUTH_GOOGLE_ID,
            clientSecret: env.AUTH_GOOGLE_SECRET,
            authorization: { params: { prompt: 'select_account', scope: 'openid email profile' } },
          }),
        ]
      : [],
    session: { strategy: 'jwt' },
    pages: { signIn: `/${DEFAULT_LOCALE}/sign-in`, error: `/${DEFAULT_LOCALE}/sign-in` },
    callbacks: {
      async signIn({ account, profile }) {
        const locale = await currentLocale();
        if (account?.provider !== 'google' || !profile?.sub || !profile.email) {
          return `/${locale}/sign-in?google=rejected`;
        }
        const outcome = await resolveGoogleSignIn(
          getContainer(),
          {
            providerAccountId: profile.sub,
            email: profile.email,
            isEmailVerified: profile.email_verified === true,
            name: profile.name ?? profile.email.split('@')[0] ?? 'User',
          },
          await readPendingGoogleSignUp(),
          await getRequestInfo(locale),
        );
        await clearPendingGoogleState();
        logger.info({ action: 'google.sign-in', outcome: outcome.kind }, 'google sign-in');

        switch (outcome.kind) {
          case 'signed-in':
            await writeSessionCookie(outcome.result.session.token);
            return outcome.result.needsTwoFactor ? `/${locale}/two-factor` : `/${locale}/dashboard`;
          case 'needs-link':
            await savePendingGoogleLink({ providerAccountId: profile.sub, email: outcome.email });
            return `/${locale}/sign-in?link=google`;
          case 'needs-sign-up':
            return `/${locale}/sign-up?google=needs-sign-up`;
          case 'rejected':
            return `/${locale}/sign-in?google=rejected`;
        }
      },
    },
  };
});
