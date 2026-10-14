'use server';

import { revalidatePath } from 'next/cache';
import { getContainer } from '@/adapters/container';
import { type ActionState, runAction } from '@/lib/action';
import { requireActionSession } from '@/lib/auth/current-session';
import { parseForm } from '@/lib/validation/form-data';
import { blockToggleSchema, respondToRequestSchema } from '@/lib/validation/request-schemas';
import { respondToRequest, setBlocked } from '@/services/requests';

const creatorOnly = () => requireActionSession({ roles: ['CREATOR'] });
const REQUESTS_PATH = '/[locale]/creator/requests';

/** FR-7.2 / UC-R2: accepts or declines the version of the request the creator saw. */
export async function respondToRequestAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await creatorOnly();
    const input = parseForm(respondToRequestSchema, formData);
    await respondToRequest(getContainer(), { userId: session.user.id, ...input });
    revalidatePath(REQUESTS_PATH, 'layout');
  });
}

/** FR-8.3: blocks or unblocks the brand behind a request. */
export async function setBrandBlockedAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await creatorOnly();
    const input = parseForm(blockToggleSchema, formData);
    await setBlocked(getContainer(), { userId: session.user.id, ...input });
    revalidatePath(REQUESTS_PATH, 'layout');
  });
}
