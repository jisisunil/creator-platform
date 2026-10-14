import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getServerEnv } from '@/config/env';
import { signValue, verifySignedValue } from './signed-value';

const COOKIE = 'social-oauth-state';
const TTL_MS = 15 * 60_000;

const stateSchema = z.object({
  nonce: z.string(),
  userId: z.string(),
  platform: z.enum(['YOUTUBE', 'INSTAGRAM']),
  locale: z.string(),
});
export type SocialOAuthState = z.infer<typeof stateSchema>;

/**
 * Starts an account-connection login: stores who started it in a signed cookie and returns
 * the random `state` for the provider URL, so the callback can reject forged or replayed
 * responses (OAuth CSRF protection).
 */
export async function beginSocialOAuth(input: Omit<SocialOAuthState, 'nonce'>): Promise<string> {
  const nonce = randomBytes(24).toString('base64url');
  const store = await cookies();
  store.set(
    COOKIE,
    signValue({ ...input, nonce }, getServerEnv().AUTH_SECRET, new Date(Date.now() + TTL_MS)),
    {
      httpOnly: true,
      secure: getServerEnv().APP_URL.startsWith('https://'),
      sameSite: 'lax',
      path: '/',
      maxAge: TTL_MS / 1000,
    },
  );
  return nonce;
}

/** The stored state if it matches the provider's `state`; the cookie is used up either way. */
export async function finishSocialOAuth(
  returnedState: string | null,
): Promise<SocialOAuthState | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  store.delete(COOKIE);
  if (!raw || !returnedState) return null;
  const parsed = stateSchema.safeParse(
    verifySignedValue(raw, getServerEnv().AUTH_SECRET, new Date()),
  );
  return parsed.success && parsed.data.nonce === returnedState ? parsed.data : null;
}

/** Where the provider sends the creator back after the login. */
export function socialCallbackUrl(platform: 'YOUTUBE' | 'INSTAGRAM'): string {
  return new URL(
    `/api/social/${platform.toLowerCase()}/callback`,
    getServerEnv().APP_URL,
  ).toString();
}
