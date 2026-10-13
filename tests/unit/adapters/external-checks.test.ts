import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createHibpBreachedPasswordChecker } from '@/adapters/security/breached-password-checker';
import { createTurnstileCaptchaVerifier } from '@/adapters/security/captcha-verifier';

function sha1(value: string): string {
  return createHash('sha1').update(value).digest('hex').toUpperCase();
}

describe('HIBP breached-password check (SR-1)', () => {
  it('sends only the 5-character hash prefix and finds a breached password', async () => {
    const hash = sha1('a-breached-password');
    const fetchMock = vi.fn(
      async () => new Response(`${hash.slice(5)}:42\r\nABCDEF0123456789ABCDEF0123456789ABC:0`),
    );
    const checker = createHibpBreachedPasswordChecker(fetchMock);

    await expect(checker.isBreached('a-breached-password')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`,
      expect.anything(),
    );
  });

  it('ignores padding entries with a zero count', async () => {
    const hash = sha1('padded-password');
    const checker = createHibpBreachedPasswordChecker(
      vi.fn(async () => new Response(`${hash.slice(5)}:0`)),
    );

    await expect(checker.isBreached('padded-password')).resolves.toBe(false);
  });

  it('falls back to the offline list when the service is down', async () => {
    const checker = createHibpBreachedPasswordChecker(
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await expect(checker.isBreached('password123')).resolves.toBe(true);
    await expect(checker.isBreached('a-unique-long-password')).resolves.toBe(false);
  });
});

describe('Turnstile CAPTCHA (SR-3)', () => {
  it('accepts a token Cloudflare confirms', async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true }));
    const verifier = createTurnstileCaptchaVerifier('secret', fetchMock);

    await expect(verifier.verify('token', '1.2.3.4')).resolves.toBe(true);
  });

  it('fails closed on a missing token, a rejection or an outage', async () => {
    const rejecting = createTurnstileCaptchaVerifier(
      'secret',
      vi.fn(async () => Response.json({ success: false })),
    );
    const failing = createTurnstileCaptchaVerifier(
      'secret',
      vi.fn(async () => {
        throw new Error('timeout');
      }),
    );

    await expect(rejecting.verify(null, null)).resolves.toBe(false);
    await expect(rejecting.verify('token', null)).resolves.toBe(false);
    await expect(failing.verify('token', null)).resolves.toBe(false);
  });
});
