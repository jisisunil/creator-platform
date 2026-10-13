import { getLogger } from '@/lib/logger';

/** Verifies a CAPTCHA response from the browser (SR-3, SR-11). */
export interface CaptchaVerifier {
  /** False when no CAPTCHA is configured (development); callers then skip it. */
  readonly isEnabled: boolean;
  verify(token: string | null, ipAddress: string | null): Promise<boolean>;
}

const logger = getLogger('captcha');

/** Used in development and tests when no keys are set. Env validation forbids it in production. */
export const disabledCaptchaVerifier: CaptchaVerifier = {
  isEnabled: false,
  verify: async () => true,
};

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_TIMEOUT_MS = 5000;

/** Cloudflare Turnstile server-side verification. Fails closed when Cloudflare is unreachable. */
export function createTurnstileCaptchaVerifier(
  secretKey: string,
  fetchImpl: typeof fetch = fetch,
): CaptchaVerifier {
  return {
    isEnabled: true,
    async verify(token, ipAddress) {
      if (!token) return false;
      const form = new URLSearchParams({ secret: secretKey, response: token });
      if (ipAddress) form.set('remoteip', ipAddress);
      try {
        const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
        });
        const result = (await response.json()) as { success?: unknown };
        return result.success === true;
      } catch (error) {
        logger.warn({ err: error }, 'captcha verification unavailable');
        return false;
      }
    },
  };
}
