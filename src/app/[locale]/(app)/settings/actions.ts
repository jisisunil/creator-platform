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
  marketingConsentSchema,
} from '@/lib/validation/account-schemas';
import { parseForm } from '@/lib/validation/form-data';
import { changePassword, requestEmailChange, signOutEverywhere } from '@/services/accounts';
import { setMarketingConsent } from '@/services/consent';

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

/** SR-2 / SEC-9: sign out of every device, including this one. */
export async function signOutEverywhereAction(): Promise<void> {
  const locale = await getLocale();
  const session = await requireActionSession();
  await signOutEverywhere(getContainer(), session.user.id, await getRequestInfo(locale));
  await clearSessionCookie();
  redirect(`/${locale}/sign-in`);
}
