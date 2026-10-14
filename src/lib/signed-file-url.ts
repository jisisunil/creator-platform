import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed, expiring URLs for private files (SR-9). The signature covers the key and the
 * expiry, so a URL can't be altered to reach another file or to live longer.
 */
export function signFileUrl(key: string, expiresAt: Date, secret: string): string {
  const expires = String(Math.floor(expiresAt.getTime() / 1000));
  const params = new URLSearchParams({ key, expires, signature: sign(key, expires, secret) });
  return `/api/files?${params.toString()}`;
}

/** True when the signature matches and the URL hasn't expired. */
export function isValidFileSignature(
  input: { key: string; expires: string; signature: string },
  secret: string,
  now: Date,
): boolean {
  const expiresAt = Number(input.expires) * 1000;
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return false;
  const expected = Buffer.from(sign(input.key, input.expires, secret));
  const actual = Buffer.from(input.signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sign(key: string, expires: string, secret: string): string {
  // Purpose prefix keeps these signatures distinct from other uses of the same secret.
  return createHmac('sha256', secret).update(`file-url:${key}:${expires}`).digest('base64url');
}
