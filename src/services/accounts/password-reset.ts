import { isAccountClosed } from '@/domain/accounts';
import { hashToken } from '@/adapters/crypto/random-token';
import { PASSWORD_RESET_TTL_MS } from '@/config/auth';
import { normaliseEmail } from '@/domain/email-address';
import { invalidLink } from '@/domain/errors';
import type { RequestInfo, ServiceContext } from '../context';
import { queueEmail, requestEmailDispatch } from '../email';
import { consumeRateLimit, recordSecurityEvent } from '../security';
import { createOneTimeLink } from './links';
import { hashAcceptablePassword } from './passwords';

/**
 * UC-A3: emails a one-hour reset link. Unknown emails get the same response and no
 * email, so this can't reveal who is registered.
 */
export async function requestPasswordReset(
  ctx: ServiceContext,
  rawEmail: string,
  request: RequestInfo,
): Promise<void> {
  const now = ctx.clock.now();
  const email = normaliseEmail(rawEmail);
  await consumeRateLimit(ctx.repos, now, 'passwordResetPerIp', request.ipAddress);
  await consumeRateLimit(ctx.repos, now, 'passwordResetPerAccount', email);

  const hasQueued = await ctx.transaction(async (repos) => {
    const user = await repos.users.findByEmail(email);
    if (!user || user.status === 'SUSPENDED' || isAccountClosed(user.status)) return false;
    const link = await createOneTimeLink(repos, {
      purpose: 'RESET_PASSWORD',
      userId: user.id,
      email,
      now,
      ttlMs: PASSWORD_RESET_TTL_MS,
      appUrl: ctx.appUrl,
      locale: user.locale,
    });
    await queueEmail(repos, {
      userId: user.id,
      toAddress: email,
      locale: user.locale,
      template: 'passwordReset',
      payload: { name: user.name, link },
    });
    await recordSecurityEvent(repos, {
      action: 'password.reset-requested',
      subjectUserId: user.id,
      ipAddress: request.ipAddress,
    });
    return true;
  });
  if (hasQueued) await requestEmailDispatch(ctx.jobQueue);
}

/**
 * UC-A3: sets a new password from a valid reset link. The link works once; every session
 * is signed out (SR-2). Following the link also proves the email address.
 */
export async function resetPassword(
  ctx: ServiceContext,
  token: string,
  newPassword: string,
  request: RequestInfo,
): Promise<void> {
  const now = ctx.clock.now();
  const link = await ctx.repos.oneTimeTokens.findUsable(hashToken(token), 'RESET_PASSWORD', now);
  if (!link) throw invalidLink();
  const passwordHash = await hashAcceptablePassword(ctx, newPassword, link.email);

  await ctx.transaction(async (repos) => {
    if (!(await repos.oneTimeTokens.consume(link.id, now))) throw invalidLink();
    const user = await repos.users.findById(link.userId);
    if (!user || user.email !== link.email) throw invalidLink();
    await repos.users.updatePasswordHash(user.id, passwordHash);
    if (user.emailVerifiedAt === null) await repos.users.markEmailVerified(user.id, now);
    const revoked = await repos.sessions.deleteAllForUser(user.id);
    await queueEmail(repos, {
      userId: user.id,
      toAddress: user.email,
      locale: user.locale,
      template: 'passwordChanged',
      payload: { name: user.name },
    });
    await recordSecurityEvent(repos, {
      action: 'password.reset',
      actorUserId: user.id,
      subjectUserId: user.id,
      ipAddress: request.ipAddress,
      metadata: { sessionsRevoked: revoked },
    });
  });
  await requestEmailDispatch(ctx.jobQueue);
}
