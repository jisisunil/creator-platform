import { EMAIL_VERIFICATION_TTL_MS } from '@/config/auth';
import type { SelfServiceRole } from '@/domain/accounts';
import { isDisposableEmail, normaliseEmail } from '@/domain/email-address';
import { captchaRequired, validationFailed } from '@/domain/errors';
import { maskEmail } from '@/lib/mask';
import type { RequestInfo, ServiceContext } from '../context';
import { queueEmail, requestEmailDispatch } from '../email';
import { consumeRateLimit, recordSecurityEvent } from '../security';
import { createOneTimeLink } from './links';
import { createAccount } from './new-account';
import { hashAcceptablePassword } from './passwords';

export interface SignUpInput {
  readonly role: SelfServiceRole;
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly acceptsMarketing: boolean;
  readonly brandName?: string;
  readonly industry?: string;
  readonly captchaToken: string | null;
}

/**
 * UC-A1: creates an unverified account and emails a verification link. The 18+ and
 * privacy-notice boxes are required by the input schema, so reaching here means both
 * were ticked. If the email is already registered, the owner gets a "you already have
 * an account" email and the caller sees the same result, so sign-up can't be used to
 * discover who is registered.
 */
export async function signUpWithPassword(
  ctx: ServiceContext,
  input: SignUpInput,
  request: RequestInfo,
): Promise<void> {
  const now = ctx.clock.now();
  await consumeRateLimit(ctx.repos, now, 'signUpPerIp', request.ipAddress);
  if (ctx.captcha.isEnabled && !(await ctx.captcha.verify(input.captchaToken, request.ipAddress))) {
    throw captchaRequired();
  }

  const email = normaliseEmail(input.email);
  if (isDisposableEmail(email)) throw validationFailed({ email: 'email.disposable' });
  if (input.role === 'BRAND' && !(input.brandName && input.industry)) {
    throw validationFailed({ brandName: 'validation.required' });
  }
  const passwordHash = await hashAcceptablePassword(ctx, input.password, email);

  await ctx.transaction(async (repos) => {
    const existing = await repos.users.findByEmail(email);
    if (existing) {
      await queueEmail(repos, {
        userId: existing.id,
        toAddress: existing.email,
        locale: existing.locale,
        template: 'accountAlreadyExists',
        payload: {
          signInLink: new URL(`/${existing.locale}/sign-in`, ctx.appUrl).toString(),
          resetLink: new URL(`/${existing.locale}/forgot-password`, ctx.appUrl).toString(),
        },
      });
      await recordSecurityEvent(repos, {
        action: 'signup.existing-email',
        subjectUserId: existing.id,
        ipAddress: request.ipAddress,
      });
      return;
    }

    const user = await createAccount(
      repos,
      now,
      {
        role: input.role,
        name: input.name,
        email,
        passwordHash,
        locale: request.locale,
        acceptsMarketing: input.acceptsMarketing,
        emailVerifiedAt: null,
        brand:
          input.role === 'BRAND' && input.brandName && input.industry
            ? { name: input.brandName, industry: input.industry }
            : undefined,
      },
      request.ipAddress,
    );
    const link = await createOneTimeLink(repos, {
      purpose: 'VERIFY_EMAIL',
      userId: user.id,
      email,
      now,
      ttlMs: EMAIL_VERIFICATION_TTL_MS,
      appUrl: ctx.appUrl,
      locale: request.locale,
    });
    await queueEmail(repos, {
      userId: user.id,
      toAddress: email,
      locale: request.locale,
      template: 'verifyEmail',
      payload: { name: user.name, link },
    });
    await recordSecurityEvent(repos, {
      action: 'signup',
      actorUserId: user.id,
      subjectUserId: user.id,
      ipAddress: request.ipAddress,
      metadata: { role: user.role, email: maskEmail(email) },
    });
  });
  await requestEmailDispatch(ctx.jobQueue);
}
