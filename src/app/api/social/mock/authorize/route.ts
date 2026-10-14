import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getServerEnv } from '@/config/env';

/**
 * Stand-in for a platform's login page when SOCIAL_PROVIDER_MODE=mock (development and
 * tests): it immediately returns to our own callback with a fake code. Not found in live
 * mode, and it only redirects back to this app, never elsewhere (no open redirect).
 */
export function GET(request: Request): NextResponse {
  const env = getServerEnv();
  if (env.SOCIAL_PROVIDER_MODE !== 'mock') return new NextResponse(null, { status: 404 });
  const url = new URL(request.url);
  const redirectUri = url.searchParams.get('redirect_uri') ?? '';
  const state = url.searchParams.get('state') ?? '';
  if (!redirectUri.startsWith(new URL('/api/social/', env.APP_URL).toString())) {
    return new NextResponse(null, { status: 400 });
  }
  const callback = new URL(redirectUri);
  callback.searchParams.set('code', `mock-${randomBytes(6).toString('hex')}`);
  callback.searchParams.set('state', state);
  return NextResponse.redirect(callback);
}
