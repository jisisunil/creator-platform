import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Encrypts secrets at rest: TOTP secrets now, social tokens later (SR-6). */
export interface TokenCipher {
  encrypt(plaintext: string): string;
  /** Throws if the value was tampered with or encrypted under another key. */
  decrypt(ciphertext: string): string;
}

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const FORMAT_VERSION = 'v1';

/**
 * AES-256-GCM with a random IV per value. Output: "v1.<iv>.<authTag>.<ciphertext>" in
 * base64url; the version prefix leaves room for key rotation (SR-10).
 */
export function createAesGcmTokenCipher(base64Key: string): TokenCipher {
  const key = Buffer.from(base64Key, 'base64');
  return {
    encrypt(plaintext) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [FORMAT_VERSION, iv, cipher.getAuthTag(), encrypted]
        .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
        .join('.');
    },
    decrypt(ciphertext) {
      const [version, iv, authTag, encrypted] = ciphertext.split('.');
      if (version !== FORMAT_VERSION || !iv || !authTag || encrypted === undefined) {
        throw new Error('Unrecognised ciphertext format');
      }
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
