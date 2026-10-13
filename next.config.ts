import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const ONE_YEAR_SECONDS = 31_536_000;

// SR-7 / SR-8: transport and browser hardening on every response. CSP is set per request
// in src/proxy.ts because it carries a nonce.
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: `max-age=${ONE_YEAR_SECONDS}; includeSubDomains; preload`,
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['pino', 'pg', 'pg-boss'],
  headers: async () => [{ source: '/:path*', headers: securityHeaders }],
  // Next defaults to one build worker per CPU; on a busy 16-thread laptop that ran out of
  // memory. Four keeps builds predictable on developer machines and CI runners.
  experimental: { cpus: 4 },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  telemetry: false,
  // Source maps upload only when a token is configured (CI release builds).
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
