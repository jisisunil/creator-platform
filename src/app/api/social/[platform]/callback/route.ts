import { NextResponse } from 'next/server';
import { getContainer } from '@/adapters/container';
import { DEFAULT_LOCALE } from '@/config/locales';
import { getCurrentSession } from '@/lib/auth/current-session';
import { finishSocialOAuth, socialCallbackUrl } from '@/lib/auth/social-oauth-state';
import { getLogger } from '@/lib/logger';
import { handleRoute } from '@/lib/route';
import { completeConnection } from '@/services/social';

const logger = getLogger('social-callback');

/**
 * FR-3.1/3.2: the platform sends the creator back here after the official login. The
 * state must match the signed cookie and the same creator must still be signed in.
 */
export function GET(request: Request): Promise<NextResponse> {
  return handleRoute(request, async () => {
    const url = new URL(request.url);
    const state = await finishSocialOAuth(url.searchParams.get('state'));
    const session = await getCurrentSession();
    const locale = state?.locale ?? DEFAULT_LOCALE;
    const accountsUrl = (result: string) =>
      new URL(`/${locale}/creator/accounts?result=${result}`, request.url);

    const code = url.searchParams.get('code');
    if (!state || !code || !session || session.user.id !== state.userId) {
      return NextResponse.redirect(accountsUrl('expired'));
    }
    try {
      const outcome = await completeConnection(getContainer(), {
        userId: session.user.id,
        platform: state.platform,
        code,
        redirectUri: socialCallbackUrl(state.platform),
      });
      if (outcome.kind === 'choose-account') {
        return NextResponse.redirect(
          new URL(`/${locale}/creator/accounts/choose?pending=${outcome.pendingId}`, request.url),
        );
      }
      return NextResponse.redirect(accountsUrl(outcome.kind));
    } catch (error) {
      logger.warn({ err: error, platform: state.platform }, 'social connection failed');
      return NextResponse.redirect(accountsUrl('failed'));
    }
  });
}
