import type { UserRecord } from '@/adapters/db/user-repository';
import { findSignInBlocker, requiresTwoFactor } from '@/domain/accounts';
import { normaliseEmail } from '@/domain/email-address';
import {
  accountSuspended,
  captchaRequired,
  emailNotVerified,
  invalidCredentials,
} from '@/domain/errors';
import {
  AFTER_SUCCESSFUL_LOGIN,
  afterFailedLogin,
  isCaptchaRequired,
  isLockedOut,
} from '@/domain/login-protection';
import { maskEmail } from '@/lib/mask';
import type { RequestInfo, ServiceContext } from '../context';
import { queueEmail, requestEmailDispatch } from '../email';
import { consumeRateLimit, failureCounters, recordSecurityEvent } from '../security';
import { deviceHashOf, type IssuedSession, issueSession } from './sessions';

export interface SignInInput {
  readonly email: string;
  readonly password: string;
  readonly captchaToken: string | null;
}

export interface SignInResult {
  readonly session: IssuedSession;
  readonly userId: string;
  /** Admins must enter a TOTP code next (SR-4). */
  readonly needsTwoFactor: boolean;
}

/** SR-3: true when this account or IP must solve a CAPTCHA before the next attempt. */
export async function isCaptchaNeededForSignIn(
  ctx: ServiceContext,
  rawEmail: string | null,
  request: RequestInfo,
): Promise<boolean> {
  if (!ctx.captcha.isEnabled) return false;
  const now = ctx.clock.now();
  const ipFailures = await failureCounters.current(ctx.repos, now, 'ip', request.ipAddress);
  const accountFailures = rawEmail
    ? await failureCounters.current(ctx.repos, now, 'account', normaliseEmail(rawEmail))
    : 0;
  return isCaptchaRequired(Math.max(ipFailures, accountFailures));
}

/**
 * UC-A2: email + password sign-in with rate limits, CAPTCHA after repeated failures and
 * a 15-minute lockout after 5 (SR-3). Unknown email, wrong password and a locked account
 * all fail the same way, in the same time.
 */
export async function signInWithPassword(
  ctx: ServiceContext,
  input: SignInInput,
  request: RequestInfo,
): Promise<SignInResult> {
  const now = ctx.clock.now();
  const email = normaliseEmail(input.email);
  await consumeRateLimit(ctx.repos, now, 'signInPerIp', request.ipAddress);
  await consumeRateLimit(ctx.repos, now, 'signInPerAccount', email);

  if (await isCaptchaNeededForSignIn(ctx, email, request)) {
    if (!(await ctx.captcha.verify(input.captchaToken, request.ipAddress))) {
      throw captchaRequired();
    }
  }

  const user = await ctx.repos.users.findByEmail(email);
  const isPasswordCorrect = await checkPassword(ctx, user, input.password);

  if (!user || !isPasswordCorrect || isLockedOut(user, now)) {
    await recordFailedSignIn(ctx, user, email, now, request, isPasswordCorrect);
    throw invalidCredentials();
  }

  const blocker = findSignInBlocker(user);
  // PRV-4: a deleted account answers like an unknown one.
  if (blocker === 'CLOSED') throw invalidCredentials();
  if (blocker === 'SUSPENDED') throw accountSuspended();
  if (blocker === 'EMAIL_NOT_VERIFIED') throw emailNotVerified();

  return completeSignIn(ctx, user, request, 'password');
}

async function checkPassword(
  ctx: ServiceContext,
  user: UserRecord | null,
  password: string,
): Promise<boolean> {
  if (!user?.passwordHash) {
    await ctx.passwordHasher.verifyAgainstDummy(password);
    return false;
  }
  return ctx.passwordHasher.verify(user.passwordHash, password);
}

async function recordFailedSignIn(
  ctx: ServiceContext,
  user: UserRecord | null,
  email: string,
  now: Date,
  request: RequestInfo,
  wasPasswordCorrect: boolean,
): Promise<void> {
  await failureCounters.record(ctx.repos, now, 'ip', request.ipAddress);
  await failureCounters.record(ctx.repos, now, 'account', email);
  if (!user) {
    await recordSecurityEvent(ctx.repos, {
      action: 'login.failure',
      ipAddress: request.ipAddress,
      metadata: { reason: 'unknown-account', email: maskEmail(email) },
    });
    return;
  }
  const isCurrentlyLocked = isLockedOut(user, now);
  // A correct password during a lockout doesn't count as another failure.
  const nextState = isCurrentlyLocked || wasPasswordCorrect ? user : afterFailedLogin(user, now);
  if (!isCurrentlyLocked && !wasPasswordCorrect) {
    await ctx.repos.users.updateLoginState(user.id, {
      failedLoginCount: nextState.failedLoginCount,
      lockedUntil: nextState.lockedUntil,
    });
  }
  const hasJustLocked = !isCurrentlyLocked && isLockedOut(nextState, now);
  await recordSecurityEvent(ctx.repos, {
    action: hasJustLocked ? 'account.locked' : 'login.failure',
    subjectUserId: user.id,
    ipAddress: request.ipAddress,
    metadata: { reason: isCurrentlyLocked ? 'locked' : 'wrong-password' },
  });
}

/**
 * Finishes any successful sign-in (password or Google): clears failure state, opens a
 * session, logs it, and emails the user about sign-ins from a new device (SEC-9).
 */
export async function completeSignIn(
  ctx: ServiceContext,
  user: UserRecord,
  request: RequestInfo,
  method: 'password' | 'google',
): Promise<SignInResult> {
  const now = ctx.clock.now();
  const deviceHash = deviceHashOf(request.userAgent);
  const isKnownDevice = await ctx.repos.audit.hasSignedInFromDevice(user.id, deviceHash);
  const hasSignedInBefore = isKnownDevice || (await ctx.repos.audit.hasAnySignIn(user.id));
  const shouldWarnNewDevice = hasSignedInBefore && !isKnownDevice;

  const session = await ctx.transaction(async (repos) => {
    await repos.users.updateLoginState(user.id, { ...AFTER_SUCCESSFUL_LOGIN, lastLoginAt: now });
    await failureCounters.clearAccount(repos, now, user.email);
    const issued = await issueSession(repos, now, user.id, request);
    await recordSecurityEvent(repos, {
      action: 'login.success',
      actorUserId: user.id,
      subjectUserId: user.id,
      ipAddress: request.ipAddress,
      metadata: { method, deviceHash },
    });
    if (shouldWarnNewDevice) {
      await queueEmail(repos, {
        userId: user.id,
        toAddress: user.email,
        locale: user.locale,
        template: 'newDeviceSignIn',
        payload: {
          name: user.name,
          device: (request.userAgent ?? 'unknown').slice(0, 120),
          time: now.toISOString(),
        },
      });
    }
    return issued;
  });
  if (shouldWarnNewDevice) await requestEmailDispatch(ctx.jobQueue);

  return { session, userId: user.id, needsTwoFactor: requiresTwoFactor(user.role) };
}
