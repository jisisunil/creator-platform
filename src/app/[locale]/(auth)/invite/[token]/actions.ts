'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { type ActionState, runAction } from '@/lib/action';
import { requireActionSession } from '@/lib/auth/current-session';
import { writeSessionCookie } from '@/lib/auth/session-cookie';
import { getRequestInfo } from '@/lib/request-info';
import { acceptInviteSchema, resetPasswordSchema } from '@/lib/validation/account-schemas';
import { parseForm } from '@/lib/validation/form-data';
import { acceptInviteAsSignedInUser, acceptInviteWithNewAccount } from '@/services/team';

const tokenSchema = resetPasswordSchema.pick({ token: true });

/** UC-A6: create an account from an invite and join the brand. */
export async function acceptInviteWithNewAccountAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const input = parseForm(acceptInviteSchema, formData);
    const result = await acceptInviteWithNewAccount(
      getContainer(),
      {
        token: input.token,
        name: input.name,
        password: input.password,
        acceptsMarketing: input.acceptsMarketing,
      },
      await getRequestInfo(locale),
    );
    await writeSessionCookie(result.session.token);
    redirect(`/${locale}/dashboard`);
  });
}

/** UC-A6: a signed-in brand user joins the inviting brand. */
export async function acceptInviteAsSignedInUserAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const session = await requireActionSession({ roles: ['BRAND'] });
    const { token } = parseForm(tokenSchema, formData);
    await acceptInviteAsSignedInUser(
      getContainer(),
      { token, userId: session.user.id },
      await getRequestInfo(locale),
    );
    redirect(`/${locale}/brand/team`);
  });
}
