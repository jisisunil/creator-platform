'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { invalidLink } from '@/domain/errors';
import { type ActionState, runAction } from '@/lib/action';
import { startGoogleOAuth } from '@/lib/auth/authjs';
import { requireActionSession } from '@/lib/auth/current-session';
import {
  clearPendingGoogleState,
  readPendingGoogleLink,
  savePendingGoogleSignUp,
} from '@/lib/auth/pending-oauth';
import {
  clearSessionCookie,
  readSessionToken,
  writeSessionCookie,
} from '@/lib/auth/session-cookie';
import { getRequestInfo } from '@/lib/request-info';
import {
  emailOnlySchema,
  googleSignUpSchema,
  linkGoogleSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  twoFactorCodeSchema,
} from '@/lib/validation/account-schemas';
import { parseForm } from '@/lib/validation/form-data';
import {
  confirmEmailChange,
  linkGoogleAfterPasswordCheck,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  verifyEmail,
  verifyTwoFactorCode,
} from '@/services/accounts';
import { acceptCurrentPrivacyNotice } from '@/services/consent';

const tokenSchema = resetPasswordSchema.pick({ token: true });
const tokenOf = (formData: FormData) => parseForm(tokenSchema, formData).token;

/** UC-A1: email sign-up. */
export async function signUpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const input = parseForm(signUpSchema, formData);
    await signUpWithPassword(
      getContainer(),
      {
        role: input.role,
        name: input.name,
        email: input.email,
        password: input.password,
        acceptsMarketing: input.acceptsMarketing,
        brandName: input.brandName,
        industry: input.industry || undefined,
        captchaToken: input.captchaToken,
      },
      await getRequestInfo(locale),
    );
    redirect(`/${locale}/check-email`);
  });
}

/** UC-A1: keeps the sign-up choices, then hands over to Google. */
export async function startGoogleSignUpAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const choices = parseForm(googleSignUpSchema, formData);
    await savePendingGoogleSignUp({
      role: choices.role,
      acceptsMarketing: choices.acceptsMarketing,
      brandName: choices.brandName,
      industry: choices.industry || undefined,
    });
    await startGoogleOAuth('google', { redirectTo: `/${locale}/dashboard` });
  });
}

/** UC-A2: Google sign-in for existing accounts. */
export async function startGoogleSignInAction(): Promise<void> {
  const locale = await getLocale();
  await clearPendingGoogleState();
  await startGoogleOAuth('google', { redirectTo: `/${locale}/dashboard` });
}

/** UC-A2: email and password sign-in. */
export async function signInAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const input = parseForm(signInSchema, formData);
    const result = await signInWithPassword(getContainer(), input, await getRequestInfo(locale));
    await writeSessionCookie(result.session.token);
    redirect(result.needsTwoFactor ? `/${locale}/two-factor` : `/${locale}/dashboard`);
  });
}

/** UC-A2: confirms the account password, then links Google to it. */
export async function linkGoogleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const input = parseForm(linkGoogleSchema, formData);
    const pending = await readPendingGoogleLink();
    if (!pending) throw invalidLink();
    const result = await linkGoogleAfterPasswordCheck(
      getContainer(),
      { ...pending, password: input.password, captchaToken: input.captchaToken },
      await getRequestInfo(locale),
    );
    await clearPendingGoogleState();
    await writeSessionCookie(result.session.token);
    redirect(result.needsTwoFactor ? `/${locale}/two-factor` : `/${locale}/dashboard`);
  });
}

/** FR-1.1: sends a new verification link. */
export async function resendVerificationAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const { email } = parseForm(emailOnlySchema, formData);
    await resendVerificationEmail(getContainer(), email, await getRequestInfo(locale));
  });
}

/** FR-1.1: confirms the email from the link (on a button press; see ADR-003). */
export async function verifyEmailAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    await verifyEmail(getContainer(), tokenOf(formData), await getRequestInfo(locale));
  });
}

/** UC-A3: emails a reset link. */
export async function forgotPasswordAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const { email } = parseForm(emailOnlySchema, formData);
    await requestPasswordReset(getContainer(), email, await getRequestInfo(locale));
  });
}

/** UC-A3: sets a new password from the reset link. */
export async function resetPasswordAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const input = parseForm(resetPasswordSchema, formData);
    await resetPassword(
      getContainer(),
      input.token,
      input.newPassword,
      await getRequestInfo(locale),
    );
  });
}

/** UC-A4: completes an email change from the link. */
export async function confirmEmailChangeAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    await confirmEmailChange(getContainer(), tokenOf(formData), await getRequestInfo(locale));
  });
}

/** SR-4: checks the admin's TOTP code for this session (also completes setup). */
export async function twoFactorAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const session = await requireActionSession({ allowPendingTwoFactor: true });
    const { code } = parseForm(twoFactorCodeSchema, formData);
    await verifyTwoFactorCode(
      getContainer(),
      { userId: session.user.id, sessionId: session.sessionId, code },
      await getRequestInfo(locale),
    );
    redirect(`/${locale}/dashboard`);
  });
}

/** PRV-8: agrees to the updated privacy notice. Failures fall through to the error page. */
export async function acceptPrivacyNoticeAction(): Promise<void> {
  const locale = await getLocale();
  const session = await requireActionSession();
  await acceptCurrentPrivacyNotice(getContainer(), session.user, await getRequestInfo(locale));
  redirect(`/${locale}/dashboard`);
}

/** Ends this session and returns home. */
export async function signOutAction(): Promise<void> {
  const locale = await getLocale();
  const token = await readSessionToken();
  if (token) await signOut(getContainer(), token);
  await clearSessionCookie();
  redirect(`/${locale}`);
}
