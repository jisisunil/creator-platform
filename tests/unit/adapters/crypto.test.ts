import { randomBytes } from 'node:crypto';
import { TOTP } from 'otpauth';
import { describe, expect, it } from 'vitest';
import { generateSecureToken, hashToken } from '@/adapters/crypto/random-token';
import { createAesGcmTokenCipher } from '@/adapters/crypto/token-cipher';
import { createTotpService } from '@/adapters/crypto/totp';

const key = randomBytes(32).toString('base64');

describe('token cipher (SR-6)', () => {
  it('round-trips a secret and never stores it in the clear', () => {
    const cipher = createAesGcmTokenCipher(key);

    const encrypted = cipher.encrypt('JBSWY3DPEHPK3PXP');

    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(encrypted.startsWith('v1.')).toBe(true);
    expect(cipher.decrypt(encrypted)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('uses a fresh IV, so the same secret encrypts differently each time', () => {
    const cipher = createAesGcmTokenCipher(key);

    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
  });

  it('rejects tampered ciphertext', () => {
    const cipher = createAesGcmTokenCipher(key);
    const [version, iv, tag, data] = cipher.encrypt('secret').split('.');
    const flipped = `${data?.startsWith('A') ? 'B' : 'A'}${data?.slice(1)}`;

    expect(() => cipher.decrypt([version, iv, tag, flipped].join('.'))).toThrow();
  });

  it('rejects values encrypted under another key', () => {
    const encrypted = createAesGcmTokenCipher(key).encrypt('secret');
    const otherCipher = createAesGcmTokenCipher(randomBytes(32).toString('base64'));

    expect(() => otherCipher.decrypt(encrypted)).toThrow();
  });
});

describe('random tokens', () => {
  it('are long, URL-safe and unique', () => {
    const first = generateSecureToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateSecureToken()).not.toBe(first);
  });

  it('hash deterministically to hex', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('TOTP (SR-4)', () => {
  const totp = createTotpService();
  const now = new Date('2026-10-09T10:00:00Z');

  it('accepts the current code and one step of drift', () => {
    const secret = totp.createSecret();
    const reference = new TOTP({ secret, digits: 6, period: 30 });

    expect(totp.verify(secret, reference.generate({ timestamp: now.getTime() }), now)).toBe(true);
    const thirtySecondsAgo = now.getTime() - 30_000;
    expect(totp.verify(secret, reference.generate({ timestamp: thirtySecondsAgo }), now)).toBe(
      true,
    );
  });

  it('rejects stale or wrong codes', () => {
    const secret = totp.createSecret();
    const reference = new TOTP({ secret, digits: 6, period: 30 });
    const fiveMinutesAgo = now.getTime() - 300_000;

    expect(totp.verify(secret, reference.generate({ timestamp: fiveMinutesAgo }), now)).toBe(false);
    expect(totp.verify(secret, '000000', now)).toBe(false);
  });

  it('builds an enrolment URI for authenticator apps', () => {
    expect(totp.buildEnrolmentUri(totp.createSecret(), 'admin@example.test')).toMatch(
      /^otpauth:\/\/totp\/Creator%20Platform:admin%40example\.test\?/,
    );
  });
});
