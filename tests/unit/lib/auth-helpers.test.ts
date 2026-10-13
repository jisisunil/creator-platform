import { describe, expect, it } from 'vitest';
import { signValue, verifySignedValue } from '@/lib/auth/signed-value';
import { sessionCookieName, sessionCookieOptions } from '@/lib/auth/session-cookie-config';
import { clientIpFrom } from '@/lib/client-ip';
import { windowStartFor } from '@/services/security';

const secret = 'test-secret-that-is-long-enough-123456';
const now = new Date('2026-10-09T10:00:00Z');
const later = new Date('2026-10-09T10:20:00Z');

describe('signed values', () => {
  it('round-trips until expiry', () => {
    const signed = signValue({ role: 'BRAND' }, secret, later);

    expect(verifySignedValue(signed, secret, now)).toEqual({ role: 'BRAND' });
    expect(verifySignedValue(signed, secret, later)).toBeNull();
  });

  it('rejects tampering and other secrets', () => {
    const signed = signValue({ role: 'CREATOR' }, secret, later);
    const [payload, signature] = signed.split('.');
    const forged = `${Buffer.from(JSON.stringify({ value: { role: 'ADMIN' }, exp: later.getTime() })).toString('base64url')}.${signature}`;

    expect(verifySignedValue(forged, secret, now)).toBeNull();
    expect(verifySignedValue(`${payload}.${signature}`, `${secret}x`, now)).toBeNull();
    expect(verifySignedValue('garbage', secret, now)).toBeNull();
  });
});

describe('session cookie (SR-2)', () => {
  it('uses the __Host- prefix and Secure on HTTPS', () => {
    expect(sessionCookieName(true)).toBe('__Host-session');
    expect(sessionCookieOptions(true)).toMatchObject({ secure: true, httpOnly: true, path: '/' });
  });

  it('is HttpOnly and SameSite=Lax with a 30-day max age', () => {
    expect(sessionCookieOptions(false)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
  });
});

describe('clientIpFrom (SR-11)', () => {
  it('trusts nothing when no proxy is configured', () => {
    expect(clientIpFrom('1.2.3.4', 0)).toBeNull();
  });

  it('takes the address added by the last trusted proxy, ignoring forged ones', () => {
    expect(clientIpFrom('6.6.6.6, 203.0.113.9', 1)).toBe('203.0.113.9');
    expect(clientIpFrom('6.6.6.6, 203.0.113.9, 10.0.0.2', 2)).toBe('203.0.113.9');
  });

  it('returns null when the header is shorter than the proxy chain', () => {
    expect(clientIpFrom('203.0.113.9', 2)).toBeNull();
    expect(clientIpFrom(null, 1)).toBeNull();
  });
});

describe('rate-limit windows', () => {
  it('aligns windows to fixed boundaries', () => {
    const rule = { limit: 5, windowMs: 15 * 60_000 };

    expect(windowStartFor(rule, new Date('2026-10-09T10:07:00Z'))).toEqual(
      new Date('2026-10-09T10:00:00Z'),
    );
    expect(windowStartFor(rule, new Date('2026-10-09T10:15:00Z'))).toEqual(
      new Date('2026-10-09T10:15:00Z'),
    );
  });
});
