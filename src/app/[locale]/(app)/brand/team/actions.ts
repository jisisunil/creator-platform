'use server';

import { getLocale } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { getContainer } from '@/adapters/container';
import { type ActionState, runAction } from '@/lib/action';
import { requireActionSession } from '@/lib/auth/current-session';
import { getRequestInfo } from '@/lib/request-info';
import { inviteMemberSchema, targetIdSchema } from '@/lib/validation/account-schemas';
import { parseForm } from '@/lib/validation/form-data';
import { inviteTeamMember, removeTeamMember, revokeTeamInvite } from '@/services/team';

const TEAM_PATH = '/[locale]/brand/team';

/** UC-A6: owner invites a member by email. */
export async function inviteMemberAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const session = await requireActionSession({ roles: ['BRAND'] });
    const { email } = parseForm(inviteMemberSchema, formData);
    await inviteTeamMember(
      getContainer(),
      { ownerUserId: session.user.id, email },
      await getRequestInfo(locale),
    );
    revalidatePath(TEAM_PATH, 'page');
  });
}

/** UC-A6: owner removes a member; their access ends immediately. */
export async function removeMemberAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const session = await requireActionSession({ roles: ['BRAND'] });
    const { id } = parseForm(targetIdSchema, formData);
    await removeTeamMember(
      getContainer(),
      { ownerUserId: session.user.id, memberUserId: id },
      await getRequestInfo(locale),
    );
    revalidatePath(TEAM_PATH, 'page');
  });
}

/** UC-A6: owner cancels a pending invite. */
export async function revokeInviteAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const session = await requireActionSession({ roles: ['BRAND'] });
    const { id } = parseForm(targetIdSchema, formData);
    await revokeTeamInvite(
      getContainer(),
      { ownerUserId: session.user.id, inviteId: id },
      await getRequestInfo(locale),
    );
    revalidatePath(TEAM_PATH, 'page');
  });
}
