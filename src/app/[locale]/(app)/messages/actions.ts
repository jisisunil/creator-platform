'use server';

import { revalidatePath } from 'next/cache';
import { getContainer } from '@/adapters/container';
import { type ActionState, runAction } from '@/lib/action';
import { requireActionSession } from '@/lib/auth/current-session';
import { reportSchema, sendMessageSchema } from '@/lib/validation/chat-schemas';
import { parseForm } from '@/lib/validation/form-data';
import { sendMessage } from '@/services/chat';
import { reportChatPartner } from '@/services/reports';

const participantsOnly = () => requireActionSession({ roles: ['BRAND', 'CREATOR'] });

/** FR-8.1: sends a message; the file, if any, is checked and scanned by the service. */
export async function sendMessageAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const { threadId, body } = parseForm(sendMessageSchema, formData);
    const file = formData.get('attachment');
    const attachment =
      file instanceof File && file.size > 0
        ? { bytes: Buffer.from(await file.arrayBuffer()), fileName: file.name }
        : null;
    await sendMessage(getContainer(), { userId: session.user.id, threadId, body, attachment });
    revalidatePath('/[locale]/messages', 'layout');
  });
}

/** FR-8.3: reports the other side of the chat to the moderators. */
export async function reportChatPartnerAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const input = parseForm(reportSchema, formData);
    await reportChatPartner(getContainer(), { userId: session.user.id, ...input });
  });
}
