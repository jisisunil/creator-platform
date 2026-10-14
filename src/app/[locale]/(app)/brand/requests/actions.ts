'use server';

import { getLocale } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { type ActionState, runAction } from '@/lib/action';
import { requireActionSession } from '@/lib/auth/current-session';
import { parseForm } from '@/lib/validation/form-data';
import {
  blockToggleSchema,
  deliverableLinesFrom,
  editRequestSchema,
  requestTargetSchema,
  sendRequestSchema,
} from '@/lib/validation/request-schemas';
import { sendRequest, setBlocked, updateRequest, withdrawRequest } from '@/services/requests';

const brandOnly = () => requireActionSession({ roles: ['BRAND'] });
const REQUESTS_PATH = '/[locale]/brand/requests';

/** FR-7.1 / UC-R1: sends a request, then opens it. */
export async function sendRequestAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const session = await brandOnly();
    const fields = parseForm(sendRequestSchema, formData);
    const id = await sendRequest(getContainer(), {
      ...fields,
      userId: session.user.id,
      deliverables: deliverableLinesFrom(fields),
    });
    revalidatePath(REQUESTS_PATH, 'layout');
    redirect(`/${locale}/brand/requests/${id}`);
  });
}

/** UC-R2: edits an open request. */
export async function updateRequestAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await brandOnly();
    const fields = parseForm(editRequestSchema, formData);
    await updateRequest(getContainer(), {
      ...fields,
      userId: session.user.id,
      deliverables: deliverableLinesFrom(fields),
    });
    revalidatePath(REQUESTS_PATH, 'layout');
  });
}

/** FR-7.2: withdraws an open request. */
export async function withdrawRequestAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await brandOnly();
    const { requestId } = parseForm(requestTargetSchema, formData);
    await withdrawRequest(getContainer(), { userId: session.user.id, requestId });
    revalidatePath(REQUESTS_PATH, 'layout');
  });
}

/** FR-8.3: blocks or unblocks the creator of a request. */
export async function setCreatorBlockedAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await brandOnly();
    const input = parseForm(blockToggleSchema, formData);
    await setBlocked(getContainer(), { userId: session.user.id, ...input });
    revalidatePath(REQUESTS_PATH, 'layout');
  });
}
