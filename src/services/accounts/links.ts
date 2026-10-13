import { generateSecureToken, hashToken } from '@/adapters/crypto/random-token';
import type { OneTimeTokenPurpose } from '@/adapters/db/one-time-token-repository';
import type { Repositories } from '@/adapters/db/repositories';

/** Paths (without locale) that emailed links open. */
const LINK_PATHS: Readonly<Record<OneTimeTokenPurpose, string>> = {
  VERIFY_EMAIL: '/verify-email',
  RESET_PASSWORD: '/reset-password',
  CHANGE_EMAIL: '/change-email/confirm',
};

/** Builds an absolute, localised link carrying a token. */
export function buildLink(appUrl: string, locale: string, path: string, token: string): string {
  const url = new URL(`/${locale}${path}`, appUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * Creates a single-use emailed link for a user, voiding older links of the same kind so
 * only the newest works. Returns the absolute URL to email.
 */
export async function createOneTimeLink(
  repos: Repositories,
  options: {
    purpose: OneTimeTokenPurpose;
    userId: string;
    email: string;
    now: Date;
    ttlMs: number;
    appUrl: string;
    locale: string;
  },
): Promise<string> {
  const token = generateSecureToken();
  await repos.oneTimeTokens.invalidateOutstanding(options.userId, options.purpose, options.now);
  await repos.oneTimeTokens.create({
    purpose: options.purpose,
    tokenHash: hashToken(token),
    userId: options.userId,
    email: options.email,
    expiresAt: new Date(options.now.getTime() + options.ttlMs),
  });
  return buildLink(options.appUrl, options.locale, LINK_PATHS[options.purpose], token);
}
