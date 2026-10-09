import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, type NextResponse } from 'next/server';
import { routing } from './i18n/routing';
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
    errorReportingOrigin: originOfDsn(process.env.NEXT_PUBLIC_SENTRY_DSN),
  });

  const headers = new Headers(request.headers);
  headers.set(NONCE_HEADER, nonce);
  headers.set(CSP_HEADER, csp);

  const response = intlMiddleware(new NextRequest(request, { headers }));
  response.headers.set(CSP_HEADER, csp);
  return response;
}

export const config = {
  // Pages only: skip API routes, Next.js internals and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
