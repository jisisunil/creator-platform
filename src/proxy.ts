import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, type NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import {
  isHttpsApp,
  sessionCookieName,
  sessionCookieOptions,
} from './lib/auth/session-cookie-config';
import { buildContentSecurityPolicy, originOfDsn } from './lib/csp';

const intlMiddleware = createIntlMiddleware(routing);

export const NONCE_HEADER = 'x-nonce';
const CSP_HEADER = 'Content-Security-Policy';

/**
 * Runs before every page: picks the locale and sets a per-request CSP nonce. Next.js reads
 * the nonce from the request's CSP header and applies it to its own scripts.
 */
export default function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === 'development',
    isHttps: process.env.APP_URL?.startsWith('https://') ?? false,
    // Fixed at build time, like the browser's Sentry DSN it must match.
    errorReportingOrigin: originOfDsn(process.env.NEXT_PUBLIC_SENTRY_DSN),
    // Next.js freezes NEXT_PUBLIC_* values at build time, which would bake "no CAPTCHA" into
    // the image. The secret key is read at runtime, and env validation requires both keys.
    isCaptchaEnabled: Boolean(process.env.TURNSTILE_SECRET_KEY),
  });

  const headers = new Headers(request.headers);
  headers.set(NONCE_HEADER, nonce);
  headers.set(CSP_HEADER, csp);

  const response = intlMiddleware(new NextRequest(request, { headers }));
  response.headers.set(CSP_HEADER, csp);
  refreshSessionCookie(request, response);
  return response;
}

/**
 * SR-2 sliding expiry, browser side: re-issue the session cookie with a full max-age on
 * each page load. The server-side expiry slides in resolveSession; an expired or revoked
 * session is rejected there whatever the cookie says. GET only: server actions (POST) may
 * be signing out, and must not have the cookie put back.
 */
function refreshSessionCookie(request: NextRequest, response: NextResponse): void {
  const isHttps = isHttpsApp();
  const name = sessionCookieName(isHttps);
  const token = request.cookies.get(name)?.value;
  if (request.method === 'GET' && token && !response.cookies.get(name)) {
    response.cookies.set(name, token, sessionCookieOptions(isHttps));
  }
}

export const config = {
  // Pages only: skip API routes, Next.js internals and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
