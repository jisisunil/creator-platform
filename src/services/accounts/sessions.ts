import { generateSecureToken, hashToken } from '@/adapters/crypto/random-token';
import type { Repositories } from '@/adapters/db/repositories';
import type { UserRecord } from '@/adapters/db/user-repository';
import {
  SESSION_MAX_AGE_MS,
  SESSION_REFRESH_INTERVAL_MS,
  TWO_FACTOR_VALIDITY_MS,
} from '@/config/auth';
import { requiresTwoFactor } from '@/domain/accounts';
import type { RequestInfo, ServiceContext } from '../context';
import { recordSecurityEvent } from '../security';

export interface IssuedSession {
  /** Goes into the HttpOnly cookie; only its hash is stored. */
  readonly token: string;
  readonly expiresAt: Date;
}

export interface ActiveSession {
  readonly sessionId: string;
  readonly user: UserRecord;
  /** False for an admin who hasn't entered a TOTP code in this session yet (SR-4). */
  readonly isTwoFactorSatisfied: boolean;
}

const MAX_USER_AGENT_LENGTH = 512;

/** Stable fingerprint of the browser, used only to spot new devices (SEC-9). */
export function deviceHashOf(userAgent: string | null): string {
  return hashToken(`device:${userAgent ?? ''}`);
}

/** Creates a session for a user who just proved who they are. */
export async function issueSession(
  repos: Repositories,
  now: Date,
  userId: string,
  request: RequestInfo,
): Promise<IssuedSession> {
  const token = generateSecureToken();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_MS);
  await repos.sessions.create({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
    lastSeenAt: now,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
    deviceHash: deviceHashOf(request.userAgent),
  });
  return { token, expiresAt };
}

/**
 * Looks up the session behind a cookie token. Expired sessions and suspended users get
 * nothing. Active sessions slide forward (SR-2), at most once per refresh interval.
 */
export async function resolveSession(
  ctx: ServiceContext,
  token: string,
): Promise<ActiveSession | null> {
  const now = ctx.clock.now();
  const tokenHash = hashToken(token);
  const found = await ctx.repos.sessions.findActiveWithUser(tokenHash, now);
  if (!found) return null;
  const { session, user } = found;

  // Suspended or deleted accounts lose every session at once (SR-2, PRV-4).
  if (user.status !== 'ACTIVE') {
    await ctx.repos.sessions.deleteByTokenHash(tokenHash);
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > SESSION_REFRESH_INTERVAL_MS) {
    await ctx.repos.sessions.extend(session.id, new Date(now.getTime() + SESSION_MAX_AGE_MS), now);
  }
  const isTwoFactorFresh =
    session.twoFactorVerifiedAt !== null &&
    now.getTime() - session.twoFactorVerifiedAt.getTime() < TWO_FACTOR_VALIDITY_MS;

  return {
    sessionId: session.id,
    user,
    isTwoFactorSatisfied: !requiresTwoFactor(user.role) || isTwoFactorFresh,
  };
}

/** Ends the session behind this cookie token. */
export async function signOut(ctx: ServiceContext, token: string): Promise<void> {
  await ctx.repos.sessions.deleteByTokenHash(hashToken(token));
}

/** Ends every session of this user, including the current one (SR-2, SEC-9). */
export async function signOutEverywhere(
  ctx: ServiceContext,
  userId: string,
  request: RequestInfo,
): Promise<void> {
  await ctx.transaction(async (repos) => {
    const count = await repos.sessions.deleteAllForUser(userId);
    await recordSecurityEvent(repos, {
      action: 'session.revoke-all',
      actorUserId: userId,
      subjectUserId: userId,
      ipAddress: request.ipAddress,
      metadata: { sessions: count },
    });
  });
}
