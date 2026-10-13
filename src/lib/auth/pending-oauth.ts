import { cookies } from 'next/headers';
import { z } from 'zod';
import { PENDING_OAUTH_TTL_MS } from '@/config/auth';
import { getServerEnv } from '@/config/env';
import { SELF_SERVICE_ROLES } from '@/domain/accounts';
import type { PendingGoogleSignUp } from '@/services/accounts';
import { signValue, verifySignedValue } from './signed-value';

/**
 * Short-lived signed cookies that carry state across the Google OAuth round trip:
 * the sign-up choices a user made before leaving, or a pending account link.
 */

const SIGN_UP_COOKIE = 'pending-google-signup';
const LINK_COOKIE = 'pending-google-link';

const pendingSignUpSchema = z.object({
  role: z.enum(SELF_SERVICE_ROLES),
  acceptsMarketing: z.boolean(),
  brandName: z.string().optional(),
  industry: z.string().optional(),
});

const pendingLinkSchema = z.object({ providerAccountId: z.string(), email: z.string() });
export type PendingGoogleLink = z.infer<typeof pendingLinkSchema>;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: getServerEnv().APP_URL.startsWith('https://'),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.floor(PENDING_OAUTH_TTL_MS / 1000),
  };
}

async function write(name: string, value: unknown): Promise<void> {
  const expiresAt = new Date(Date.now() + PENDING_OAUTH_TTL_MS);
  const store = await cookies();
  store.set(name, signValue(value, getServerEnv().AUTH_SECRET, expiresAt), cookieOptions());
}

async function read<T>(name: string, schema: z.ZodType<T>): Promise<T | null> {
  const store = await cookies();
  const raw = store.get(name)?.value;
  if (!raw) return null;
  const parsed = schema.safeParse(verifySignedValue(raw, getServerEnv().AUTH_SECRET, new Date()));
  return parsed.success ? parsed.data : null;
}

export const savePendingGoogleSignUp = (value: PendingGoogleSignUp) => write(SIGN_UP_COOKIE, value);
export const readPendingGoogleSignUp = () => read(SIGN_UP_COOKIE, pendingSignUpSchema);
export const savePendingGoogleLink = (value: PendingGoogleLink) => write(LINK_COOKIE, value);
export const readPendingGoogleLink = () => read(LINK_COOKIE, pendingLinkSchema);

/** Clears both pending cookies once the flow finishes. */
export async function clearPendingGoogleState(): Promise<void> {
  const store = await cookies();
  store.delete(SIGN_UP_COOKIE);
  store.delete(LINK_COOKIE);
}
