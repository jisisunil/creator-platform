import { invalidState, notFound, validationFailed } from '@/domain/errors';
import type { RequestInfo, ServiceContext } from '../context';
import { consumeRateLimit, recordSecurityEvent } from '../security';

export interface TotpEnrolment {
  /** Base32 secret, shown for manual entry. */
  readonly secret: string;
  /** otpauth:// URI, shown as a QR code. */
  readonly uri: string;
}

/** True when the user has finished setting up an authenticator app. */
export async function hasTwoFactorEnabled(ctx: ServiceContext, userId: string): Promise<boolean> {
  const user = await ctx.repos.users.findById(userId);
  return Boolean(user?.totpEnabledAt);
}

/**
 * SR-4: begins (or resumes) authenticator setup for a user without 2FA. The secret is
 * stored encrypted and only becomes active once a code from the app is confirmed. A
 * pending secret is reused, so reloading the page doesn't invalidate a scanned code.
 */
export async function startTotpEnrolment(
  ctx: ServiceContext,
  userId: string,
): Promise<TotpEnrolment> {
  const user = await ctx.repos.users.findById(userId);
  if (!user) throw notFound();
  if (user.totpEnabledAt) throw invalidState();
  const secret = user.totpSecretEncrypted
    ? ctx.tokenCipher.decrypt(user.totpSecretEncrypted)
    : ctx.totp.createSecret();
  if (!user.totpSecretEncrypted) {
    await ctx.repos.users.setTotpSecret(user.id, ctx.tokenCipher.encrypt(secret));
  }
  return { secret, uri: ctx.totp.buildEnrolmentUri(secret, user.email) };
}

/**
 * SR-4: checks a TOTP code. During setup it also activates 2FA. Success marks the current
 * session as verified; attempts are rate-limited per account.
 */
export async function verifyTwoFactorCode(
  ctx: ServiceContext,
  input: { userId: string; sessionId: string; code: string },
  request: RequestInfo,
): Promise<void> {
  const now = ctx.clock.now();
  await consumeRateLimit(ctx.repos, now, 'twoFactorPerAccount', input.userId);
  const user = await ctx.repos.users.findById(input.userId);
  if (!user?.totpSecretEncrypted) throw invalidState();

  const secret = ctx.tokenCipher.decrypt(user.totpSecretEncrypted);
  if (!ctx.totp.verify(secret, input.code, now)) {
    await recordSecurityEvent(ctx.repos, {
      action: 'two-factor.failure',
      subjectUserId: user.id,
      ipAddress: request.ipAddress,
    });
    throw validationFailed({ code: 'twoFactor.invalidCode' });
  }

  await ctx.transaction(async (repos) => {
    const isEnrolling = user.totpEnabledAt === null;
    if (isEnrolling) await repos.users.enableTotp(user.id, now);
    await repos.sessions.markTwoFactorVerified(input.sessionId, now);
    await recordSecurityEvent(repos, {
      action: isEnrolling ? 'two-factor.enabled' : 'two-factor.success',
      actorUserId: user.id,
      subjectUserId: user.id,
      ipAddress: request.ipAddress,
    });
  });
}
