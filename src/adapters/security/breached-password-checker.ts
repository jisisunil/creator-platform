import { createHash } from 'node:crypto';
import { getLogger } from '@/lib/logger';

/** Checks passwords against known breaches (SR-1). */
export interface BreachedPasswordChecker {
  isBreached(password: string): Promise<boolean>;
}

const logger = getLogger('breached-password-checker');

// A small offline list of very common passwords that meet the length rule. Used when the
// online check is disabled or unreachable, so the most obvious choices are still refused.
const COMMON_LONG_PASSWORDS: ReadonlySet<string> = new Set([
  '1234567890',
  '12345678910',
  '123456789a',
  '0987654321',
  '1q2w3e4r5t',
  '1qaz2wsx3edc',
  'qwertyuiop',
  'qwerty12345',
  'qwerty123456',
  'password12',
  'password123',
  'password1234',
  'passw0rd123',
  'iloveyou123',
  'abcdefghij',
  'abcd123456',
  'asdfghjkl1',
  'zxcvbnm123',
  'welcome123',
  'india12345',
  'india@1234',
  'admin12345',
  'letmein123',
  'football123',
  'sunshine123',
  'princess123',
  'monkey12345',
  'superman123',
  'starwars123',
  'qwertyuiop123',
]);

/** Offline check against the bundled common-password list. */
export function createOfflineBreachedPasswordChecker(): BreachedPasswordChecker {
  return { isBreached: async (password) => COMMON_LONG_PASSWORDS.has(password.toLowerCase()) };
}

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const HIBP_TIMEOUT_MS = 3000;
const SHA1_PREFIX_LENGTH = 5;

/**
 * Have I Been Pwned range API with k-anonymity: only the first 5 hex characters of the
 * password's SHA-1 leave the server, never the password or its full hash. Falls back to
 * the offline list when the service is slow or down, so sign-up never blocks on it.
 */
export function createHibpBreachedPasswordChecker(
  fetchImpl: typeof fetch = fetch,
): BreachedPasswordChecker {
  const offline = createOfflineBreachedPasswordChecker();
  return {
    async isBreached(password) {
      if (await offline.isBreached(password)) return true;
      const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
      const prefix = sha1.slice(0, SHA1_PREFIX_LENGTH);
      const suffix = sha1.slice(SHA1_PREFIX_LENGTH);
      try {
        const response = await fetchImpl(`${HIBP_RANGE_URL}${prefix}`, {
          headers: { 'Add-Padding': 'true' },
          signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`HIBP responded ${response.status}`);
        const body = await response.text();
        return body.split('\n').some((line) => {
          const [lineSuffix, count] = line.trim().split(':');
          return lineSuffix === suffix && Number(count) > 0;
        });
      } catch (error) {
        logger.warn({ err: error }, 'breached-password lookup unavailable; used offline list');
        return false;
      }
    },
  };
}
