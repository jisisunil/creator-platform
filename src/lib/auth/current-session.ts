import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getContainer } from '@/adapters/container';
import type { UserRole } from '@/domain/accounts';
import { notAllowed, unauthenticated } from '@/domain/errors';
import { type ActiveSession, resolveSession } from '@/services/accounts';
import { getConsentStatus } from '@/services/consent';
import { readSessionToken } from './session-cookie';

/** The signed-in session for this request, looked up once per request. */
export const getCurrentSession = cache(async (): Promise<ActiveSession | null> => {
  const token = await readSessionToken();
  return token ? resolveSession(getContainer(), token) : null;
});

export interface PageGuardOptions {
  readonly roles?: readonly UserRole[];
  /** For the two-factor page itself, which runs before 2FA is complete. */
  readonly allowPendingTwoFactor?: boolean;
  /** For the consent page itself, which runs before re-consent is given. */
  readonly allowPendingConsent?: boolean;
}

/**
 * Page guard: sends visitors to sign in, admins to the two-factor check, and users to the
 * consent page when the privacy notice changed (PRV-8). Wrong role → not found, so pages
 * don't reveal what exists (SR-5).
 */
export async function requirePageSession(
  locale: string,
  options: PageGuardOptions = {},
): Promise<ActiveSession> {
  const session = await getCurrentSession();
  if (!session) redirect(`/${locale}/sign-in`);
  if (!session.isTwoFactorSatisfied && !options.allowPendingTwoFactor) {
    redirect(`/${locale}/two-factor`);
  }
  if (!options.allowPendingConsent) {
    const consent = await getConsentStatus(getContainer(), session.user);
    if (consent.needsReconsent) redirect(`/${locale}/consent`);
  }
  if (options.roles && !options.roles.includes(session.user.role)) redirect(`/${locale}/dashboard`);
  return session;
}

/**
 * Server action guard: every action checks authentication and role itself, whatever the
 * page showed (CLAUDE.md §7). Throws domain errors the action wrapper maps.
 */
export async function requireActionSession(
  options: { roles?: readonly UserRole[]; allowPendingTwoFactor?: boolean } = {},
): Promise<ActiveSession> {
  const session = await getCurrentSession();
  if (!session) throw unauthenticated();
  if (!session.isTwoFactorSatisfied && !options.allowPendingTwoFactor) throw unauthenticated();
  if (options.roles && !options.roles.includes(session.user.role)) throw notAllowed();
  return session;
}
