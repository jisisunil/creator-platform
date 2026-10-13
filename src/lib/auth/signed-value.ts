import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signs a JSON value with HMAC-SHA256 and an expiry, for short-lived state kept in a
 * cookie. Not encrypted: only put data here the user may see.
 */
export function signValue(value: unknown, secret: string, expiresAt: Date): string {
  const payload = Buffer.from(JSON.stringify({ value, exp: expiresAt.getTime() })).toString(
    'base64url',
  );
  return `${payload}.${hmac(payload, secret)}`;
}

/** The value, or null if the signature is wrong, the format is bad or it has expired. */
export function verifySignedValue(signed: string, secret: string, now: Date): unknown {
  const [payload, signature] = signed.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(hmac(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      value?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.exp !== 'number' || parsed.exp <= now.getTime()) return null;
    return parsed.value ?? null;
  } catch {
    // Malformed payload behind a valid signature can't happen unless the secret leaked;
    // treat it like any invalid value.
    return null;
  }
}

function hmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
