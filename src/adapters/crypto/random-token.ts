import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** A URL-safe random token with 256 bits of entropy (session cookies, emailed links). */
export function generateSecureToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * SHA-256 of a token, hex-encoded. Only hashes are stored, so a database leak doesn't
 * expose usable sessions or links. A fast hash is fine because tokens are high-entropy.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
