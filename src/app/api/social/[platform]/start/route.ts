import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getContainer } from '@/adapters/container';
import { getServerEnv } from '@/config/env';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/config/locales';
import { getCurrentSession } from '@/lib/auth/current-session';
import { beginSocialOAuth, socialCallbackUrl } from '@/lib/auth/social-oauth-state';
import { handleRoute } from '@/lib/route';
import { buildConnectionUrl } from '@/services/social';

const PLATFORMS = { youtube: 'YOUTUBE', instagram: 'INSTAGRAM' } as const;
const SEE_OTHER = 303;

/**
 * FR-3.1/3.2: starts an account connection from a plain form POST and sends the browser to
 * the platform's official login with a full-page redirect. Route handlers don't get Next's
 * server-action CSRF check, so the request must come from our own origin (SR-8).
 */
export function POST(
  request: Request,
  { params }: { params: Promise<{ platform: string }> },
): Promise<NextResponse> {
  return handleRoute(request, async () => {
    const appOrigin = new URL(getServerEnv().APP_URL).origin;
    if (request.headers.get('origin') !== appOrigin) {
      return new NextResponse(null, { status: 403 });
    }
    const { platform: platformParam } = await params;
    const platform = PLATFORMS[platformParam as keyof typeof PLATFORMS];
    const session = await getCurrentSession();
    if (!platform || session?.user.role !== 'CREATOR' || !session.isTwoFactorSatisfied) {
      return new NextResponse(null, { status: 404 });
    }
    // API routes skip the locale middleware; the language choice lives in this cookie.
    const requested = (await cookies()).get('NEXT_LOCALE')?.value ?? DEFAULT_LOCALE;
    const locale = (SUPPORTED_LOCALES as readonly string[]).includes(requested)
      ? requested
      : DEFAULT_LOCALE;
    const state = await beginSocialOAuth({ userId: session.user.id, platform, locale });
    const target = buildConnectionUrl(getContainer(), {
      platform,
      state,
      redirectUri: socialCallbackUrl(platform),
    });
    return NextResponse.redirect(target, SEE_OTHER);
  });
}
