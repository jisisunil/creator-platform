import { hashToken } from '@/adapters/crypto/random-token';
import { EMAIL_CHANGE_TTL_MS } from '@/config/auth';
import { isDisposableEmail, normaliseEmail } from '@/domain/email-address';
import { invalidLink, notFound, validationFailed } from '@/domain/errors';
import { maskEmail } from '@/lib/mask';
import type { RequestInfo, ServiceContext } from '../context';
import { queueEmail, requestEmailDispatch } from '../email';
import { recordSecurityEvent } from '../security';
import { createOneTimeLink } from './links';
import { hashAcceptablePassword } from './passwords';

async function assertCurrentPassword(
  ctx: ServiceContext,
  passwordHash: string | null,
  currentPassword: string,
): Promise<void> {
  // Google-only accounts have no password to confirm; their session is the proof.
  if (passwordHash === null) return;
  if (!(await ctx.passwordHasher.verify(passwordHash, currentPassword))) {
    throw validationFailed({ currentPassword: 'password.incorrect' });
  }
}

/**
 * FR-1.3: changes the password after checking the current one. Every other session is
 * signed out (SR-2) and the user is told by email.
 */
export async function changePassword(
  ctx: ServiceContext,
  input: { userId: string; sessionId: string; currentPassword: string; newPassword: string },
  request: RequestInfo,
): Promise<void> {
  const user = await ctx.repos.users.findById(input.userId);
  if (!user) throw notFound();
  await assertCurrentPassword(ctx, user.passwordHash, input.currentPassword);
  const passwordHash = await hashAcceptablePassword(
    ctx,
    input.newPassword,
    user.email,
    'newPassword',
  );

  await ctx.transaction(async (repos) => {
    await repos.users.updatePasswordHash(user.id, passwordHash);
    const revoked = await repos.sessions.deleteAllForUser(user.id, input.sessionId);
    await queueEmail(repos, {
      userId: user.id,
      toAddress: user.email,
      locale: user.locale,
      template: 'passwordChanged',
      payload: { name: user.name },
    });
    await recordSecurityEvent(repos, {
      action: 'password.changed',
      actorUserId: user.id,
      subjectUserId: user.id,
      ipAddress: request.ipAddress,
      metadata: { otherSessionsRevoked: revoked },
    });
  });
  await requestEmailDispatch(ctx.jobQueue);
}

/**
 * UC-A4: starts an email change. The new address gets a confirmation link; the old one is
 * told. Nothing changes until the link is used, so an abandoned change keeps the old email.
 */
export async function requestEmailChange(
  ctx: ServiceContext,
  input: { userId: string; newEmail: string; currentPassword: string },
  request: RequestInfo,
): Promise<void> {
  const now = ctx.clock.now();
  const user = await ctx.repos.users.findById(input.userId);
  if (!user) throw notFound();
  await assertCurrentPassword(ctx, user.passwordHash, input.currentPassword);

  const newEmail = normaliseEmail(input.newEmail);
  if (newEmail === user.email) throw validationFailed({ newEmail: 'email.sameAsCurrent' });
  if (isDisposableEmail(newEmail)) throw validationFailed({ newEmail: 'email.disposable' });
  if (await ctx.repos.users.findByEmail(newEmail)) {
    throw validationFailed({ newEmail: 'email.unavailable' });
  }

  await ctx.transaction(async (repos) => {
    const link = await createOneTimeLink(repos, {
      purpose: 'CHANGE_EMAIL',
      userId: user.id,
      email: newEmail,
      now,
      ttlMs: EMAIL_CHANGE_TTL_MS,
      appUrl: ctx.appUrl,
      locale: user.locale,
    });
    await queueEmail(repos, {
      userId: user.id,
      toAddress: newEmail,
      locale: user.locale,
      template: 'confirmEmailChange',
      payload: { name: user.name, link },
    });
    await queueEmail(repos, {
      userId: user.id,
      toAddress: user.email,
      locale: user.locale,
      template: 'emailChangeRequested',
      payload: { name: user.name, newEmail: maskEmail(newEmail) },
    });
    await recordSecurityEvent(repos, {
      action: 'email.change-requested',
      actorUserId: user.id,
      subjectUserId: user.id,
      ipAddress: request.ipAddress,
      metadata: { newEmail: maskEmail(newEmail) },
    });
  });
  await requestEmailDispatch(ctx.jobQueue);
}

/** UC-A4: completes an email change from the link sent to the new address. */
export async function confirmEmailChange(
  ctx: ServiceContext,
  token: string,
  request: RequestInfo,
): Promise<void> {
  const now = ctx.clock.now();
  await ctx.transaction(async (repos) => {
    const link = await repos.oneTimeTokens.findUsable(hashToken(token), 'CHANGE_EMAIL', now);
    if (!link || !(await repos.oneTimeTokens.consume(link.id, now))) throw invalidLink();
    // Someone may have registered the address since the link was sent.
    if (await repos.users.findByEmail(link.email)) throw invalidLink();
    await repos.users.updateEmail(link.userId, link.email, now);
    await recordSecurityEvent(repos, {
      action: 'email.changed',
      actorUserId: link.userId,
      subjectUserId: link.userId,
      ipAddress: request.ipAddress,
      metadata: { newEmail: maskEmail(link.email) },
    });
  });
}
