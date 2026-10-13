import { findSignInBlocker, type SelfServiceRole } from '@/domain/accounts';
import { normaliseEmail } from '@/domain/email-address';
import { invalidState } from '@/domain/errors';
import type { RequestInfo, ServiceContext } from '../context';
import { recordSecurityEvent } from '../security';
import { createAccount } from './new-account';
import { completeSignIn, type SignInResult, signInWithPassword } from './sign-in';

export const GOOGLE_PROVIDER = 'google';

/** The verified identity Google returned. */
export interface GoogleProfile {
  readonly providerAccountId: string;
  readonly email: string;
  readonly isEmailVerified: boolean;
  readonly name: string;
}

/**
 * Choices a new user made on the sign-up page before going to Google. The page only
 * creates this after the 18+ and privacy-notice boxes are ticked.
 */
export interface PendingGoogleSignUp {
  readonly role: SelfServiceRole;
  readonly acceptsMarketing: boolean;
  readonly brandName?: string;
  readonly industry?: string;
}

export type GoogleSignInOutcome =
  | { readonly kind: 'signed-in'; readonly result: SignInResult }
  /** No account yet, and the user didn't start from sign-up: send them there. */
  | { readonly kind: 'needs-sign-up' }
  /** A password account uses this email: confirm the password before linking (UC-A2). */
  | { readonly kind: 'needs-link'; readonly email: string }
  | { readonly kind: 'rejected'; readonly reason: 'email-not-verified' | 'suspended' };

/**
 * Decides what a completed Google sign-in means. Signs in a linked account, creates a new
 * account when the user came from sign-up, and otherwise asks for sign-up or for the
 * existing password before linking.
 */
export async function resolveGoogleSignIn(
  ctx: ServiceContext,
  profile: GoogleProfile,
  pendingSignUp: PendingGoogleSignUp | null,
  request: RequestInfo,
): Promise<GoogleSignInOutcome> {
  if (!profile.isEmailVerified) return { kind: 'rejected', reason: 'email-not-verified' };
  const email = normaliseEmail(profile.email);

  const linkedUserId = await ctx.repos.authAccounts.findUserId(
    GOOGLE_PROVIDER,
    profile.providerAccountId,
  );
  if (linkedUserId) {
    const user = await ctx.repos.users.findById(linkedUserId);
    if (!user) return { kind: 'needs-sign-up' };
    if (findSignInBlocker(user) === 'SUSPENDED') return { kind: 'rejected', reason: 'suspended' };
    return { kind: 'signed-in', result: await completeSignIn(ctx, user, request, 'google') };
  }

  const existing = await ctx.repos.users.findByEmail(email);
  if (existing) return { kind: 'needs-link', email };
  if (!pendingSignUp) return { kind: 'needs-sign-up' };

  const now = ctx.clock.now();
  const user = await ctx.transaction(async (repos) => {
    const created = await createAccount(
      repos,
      now,
      {
        role: pendingSignUp.role,
        name: profile.name,
        email,
        passwordHash: null,
        locale: request.locale,
        acceptsMarketing: pendingSignUp.acceptsMarketing,
        emailVerifiedAt: now,
        brand:
          pendingSignUp.role === 'BRAND' && pendingSignUp.brandName && pendingSignUp.industry
            ? { name: pendingSignUp.brandName, industry: pendingSignUp.industry }
            : undefined,
      },
      request.ipAddress,
    );
    await repos.authAccounts.link(created.id, GOOGLE_PROVIDER, profile.providerAccountId);
    await recordSecurityEvent(repos, {
      action: 'signup',
      actorUserId: created.id,
      subjectUserId: created.id,
      ipAddress: request.ipAddress,
      metadata: { role: created.role, method: 'google' },
    });
    return created;
  });
  return { kind: 'signed-in', result: await completeSignIn(ctx, user, request, 'google') };
}

/**
 * UC-A2 edge case: links a Google identity to an existing password account, but only
 * after the user signs in with that account's password (same lockout rules apply).
 */
export async function linkGoogleAfterPasswordCheck(
  ctx: ServiceContext,
  input: {
    providerAccountId: string;
    email: string;
    password: string;
    captchaToken: string | null;
  },
  request: RequestInfo,
): Promise<SignInResult> {
  const result = await signInWithPassword(
    ctx,
    { email: input.email, password: input.password, captchaToken: input.captchaToken },
    request,
  );
  const user = await ctx.repos.users.findById(result.userId);
  if (!user) throw invalidState();

  const alreadyLinkedTo = await ctx.repos.authAccounts.findUserId(
    GOOGLE_PROVIDER,
    input.providerAccountId,
  );
  if (alreadyLinkedTo && alreadyLinkedTo !== user.id) throw invalidState();
  if (!alreadyLinkedTo) {
    await ctx.transaction(async (repos) => {
      await repos.authAccounts.link(user.id, GOOGLE_PROVIDER, input.providerAccountId);
      await recordSecurityEvent(repos, {
        action: 'google.linked',
        actorUserId: user.id,
        subjectUserId: user.id,
        ipAddress: request.ipAddress,
      });
    });
  }
  return result;
}
