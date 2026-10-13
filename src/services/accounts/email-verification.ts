import { hashToken } from '@/adapters/crypto/random-token';
import { EMAIL_VERIFICATION_TTL_MS } from '@/config/auth';
import { normaliseEmail } from '@/domain/email-address';
import { invalidLink } from '@/domain/errors';
import type { RequestInfo, ServiceContext } from '../context';
import { queueEmail, requestEmailDispatch } from '../email';
import { consumeRateLimit, recordSecurityEvent } from '../security';
import { createOneTimeLink } from './links';

/** FR-1.1: confirms the email address from the emailed link and activates the account. */
export async function verifyEmail(
  ctx: ServiceContext,
  token: string,
  request: RequestInfo,
): Promise<void> {
  const now = ctx.clock.now();
  await ctx.transaction(async (repos) => {
    const link = await repos.oneTimeTokens.findUsable(hashToken(token), 'VERIFY_EMAIL', now);
    if (!link || !(await repos.oneTimeTokens.consume(link.id, now))) throw invalidLink();
    const user = await repos.users.findById(link.userId);
    // The link must be for the address the account still has.
    if (!user || user.email !== link.email) throw invalidLink();
    await repos.users.markEmailVerified(user.id, now);
    await recordSecurityEvent(repos, {
      action: 'email.verified',
      actorUserId: user.id,
      subjectUserId: user.id,
      ipAddress: request.ipAddress,
    });
  });
}

/**
 * Sends a fresh verification link to an unverified account. Responds the same way for
 * unknown or already-verified emails, so it can't be used to probe accounts.
 */
export async function resendVerificationEmail(
  ctx: ServiceContext,
  rawEmail: string,
  request: RequestInfo,
): Promise<void> {
  const now = ctx.clock.now();
  const email = normaliseEmail(rawEmail);
  await consumeRateLimit(ctx.repos, now, 'verificationResendPerAccount', email);
  const hasQueued = await ctx.transaction(async (repos) => {
    const user = await repos.users.findByEmail(email);
    if (!user || user.emailVerifiedAt !== null) return false;
    const link = await createOneTimeLink(repos, {
      purpose: 'VERIFY_EMAIL',
      userId: user.id,
      email,
      now,
      ttlMs: EMAIL_VERIFICATION_TTL_MS,
      appUrl: ctx.appUrl,
      locale: user.locale,
    });
    await queueEmail(repos, {
      userId: user.id,
      toAddress: email,
      locale: user.locale,
      template: 'verifyEmail',
      payload: { name: user.name, link },
    });
    await recordSecurityEvent(repos, {
      action: 'email.verification-resent',
      subjectUserId: user.id,
      ipAddress: request.ipAddress,
    });
    return true;
  });
  if (hasQueued) await requestEmailDispatch(ctx.jobQueue);
}
