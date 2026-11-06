import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, originOfDsn } from '@/lib/csp';

describe('buildContentSecurityPolicy (SR-8)', () => {
  it('allows only nonce-carrying scripts in production', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'abc123',
      isDevelopment: false,
      isHttps: true,
    });

    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('forbids framing, plugins and foreign form targets', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'n', isDevelopment: false, isHttps: true });

    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it('NFR-5 lets only our own service worker run', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'n', isDevelopment: false, isHttps: true });

    expect(csp).toContain("worker-src 'self'");
  });

  it('permits the error-reporting origin for connections', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'n',
      isDevelopment: false,
      isHttps: true,
      errorReportingOrigin: 'https://o1.ingest.sentry.io',
    });

    expect(csp).toContain("connect-src 'self' https://o1.ingest.sentry.io");
  });

  it('does not upgrade requests when served over plain http (local runs)', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'n', isDevelopment: false, isHttps: false });

    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('ADR-013 allows Razorpay Checkout only when payments run on Razorpay', () => {
    const base = { nonce: 'n', isDevelopment: false, isHttps: true };

    const off = buildContentSecurityPolicy(base);
    const on = buildContentSecurityPolicy({ ...base, isRazorpayEnabled: true });

    expect(off).toContain("frame-src 'none'");
    expect(off).not.toContain('razorpay');
    expect(on).toContain('frame-src https://api.razorpay.com https://checkout.razorpay.com');
    expect(on).toMatch(/connect-src [^;]*https:\/\/api\.razorpay\.com/);
  });

  it('relaxes eval only in development for hot reload', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'n', isDevelopment: true, isHttps: false });

    expect(csp).toContain("'unsafe-eval'");
  });
});

describe('originOfDsn', () => {
  it('extracts the origin and ignores missing or invalid DSNs', () => {
    expect(originOfDsn('https://key@o1.ingest.sentry.io/42')).toBe('https://o1.ingest.sentry.io');
    expect(originOfDsn(undefined)).toBeUndefined();
    expect(originOfDsn('not a url')).toBeUndefined();
  });
});
