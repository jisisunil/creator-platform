'use server';

import { getLocale } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { type ActionState, runAction } from '@/lib/action';
import { requireActionSession } from '@/lib/auth/current-session';
import { clearSessionCookie } from '@/lib/auth/session-cookie';
import { getRequestInfo } from '@/lib/request-info';
import {
  changeEmailSchema,
  changePasswordSchema,
  correctionRequestSchema,
  deleteAccountSchema,
  marketingConsentSchema,
} from '@/lib/validation/account-schemas';
import { parseForm } from '@/lib/validation/form-data';
import { notificationPreferencesSchema } from '@/lib/validation/notification-schemas';
import { changePassword, requestEmailChange, signOutEverywhere } from '@/services/accounts';
import { setMarketingConsent } from '@/services/consent';
import { saveNotificationPreferences } from '@/services/notifications';
import { deleteMyAccount, requestCorrection } from '@/services/privacy';

/** FR-1.3: change password; other sessions are signed out. */
export async function changePasswordAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const session = await requireActionSession();
    const input = parseForm(changePasswordSchema, formData);
    await changePassword(
      getContainer(),
      { userId: session.user.id, sessionId: session.sessionId, ...input },
      await getRequestInfo(locale),
    );
  });
}

/** UC-A4: send a confirmation link to a new email address. */
export async function changeEmailAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const session = await requireActionSession();
    const input = parseForm(changeEmailSchema, formData);
    await requestEmailChange(
      getContainer(),
      { userId: session.user.id, ...input },
      await getRequestInfo(locale),
    );
  });
}

/** PR-4 / PRV-5: turn marketing emails on or off. */
export async function setMarketingConsentAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const session = await requireActionSession();
    const { isGranted } = parseForm(marketingConsentSchema, formData);
    await setMarketingConsent(
      getContainer(),
      session.user,
      isGranted,
      await getRequestInfo(locale),
    );
    revalidatePath('/[locale]/settings', 'page');
  });
}

/** FR-12.2: which notifications the user gets in the app and by email. */
export async function saveNotificationPreferencesAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireActionSession();
    const { enabled } = parseForm(notificationPreferencesSchema, formData);
    await saveNotificationPreferences(getContainer(), {
      userId: session.user.id,
      role: session.user.role,
      enabled,
    });
    revalidatePath('/[locale]/settings', 'page');
  });
}

/** PRV-3: ask an admin to correct data the user can't edit. */
export async function requestCorrectionAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireActionSession();
    const { details } = parseForm(correctionRequestSchema, formData);
    await requestCorrection(getContainer(), { userId: session.user.id, details });
    revalidatePath('/[locale]/settings', 'page');
  });
}

/** PRV-4: delete the account; the user is signed out at once. */
export async function deleteAccountAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = await getLocale();
  const request = await getRequestInfo(locale);
  return runAction(async () => {
    const session = await requireActionSession();
    const { confirmEmail } = parseForm(deleteAccountSchema, formData);
    await deleteMyAccount(getContainer(), { userId: session.user.id, confirmEmail, request });
    await clearSessionCookie();
    redirect(`/${locale}/sign-in?deleted=1`);
  });
}

/** SR-2 / SEC-9: sign out of every device, including this one. */
export async function signOutEverywhereAction(): Promise<void> {
  const locale = await getLocale();
  const session = await requireActionSession();
  await signOutEverywhere(getContainer(), session.user.id, await getRequestInfo(locale));
  await clearSessionCookie();
  redirect(`/${locale}/sign-in`);
}
