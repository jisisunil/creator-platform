'use server';

import { revalidatePath } from 'next/cache';
import { getContainer } from '@/adapters/container';
import { type ActionState, runAction } from '@/lib/action';
import { requireActionSession } from '@/lib/auth/current-session';
import {
  cancelDealSchema,
  contentNoteSchema,
  dealTargetSchema,
  dealTermsSchema,
  paymentDisputeSchema,
  postLinkSchema,
} from '@/lib/validation/deal-schemas';
import { parseForm } from '@/lib/validation/form-data';
import {
  addPostLink,
  cancelDeal,
  confirmPaymentReceived,
  markDealPaid,
  reportPaymentNotReceived,
  submitContent,
  updateDealTerms,
} from '@/services/deals';

const participantsOnly = () => requireActionSession({ roles: ['BRAND', 'CREATOR'] });
const DEALS_PATH = '/[locale]/deals';

/** FR-9.2: the brand records the agreed amount and payment terms. */
export async function updateDealTermsAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const input = parseForm(dealTermsSchema, formData);
    await updateDealTerms(getContainer(), { userId: session.user.id, ...input });
    revalidatePath(DEALS_PATH, 'layout');
  });
}

/** FR-9.1: the creator submits content for review. */
export async function submitContentAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const input = parseForm(contentNoteSchema, formData);
    await submitContent(getContainer(), { userId: session.user.id, ...input });
    revalidatePath(DEALS_PATH, 'layout');
  });
}

/** FR-9.3 / UC-R6: the creator adds a published post's link. */
export async function addPostLinkAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const input = parseForm(postLinkSchema, formData);
    await addPostLink(getContainer(), { userId: session.user.id, ...input });
    revalidatePath(DEALS_PATH, 'layout');
  });
}

/** UC-R5: the brand marks the deal paid. */
export async function markDealPaidAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const { dealId } = parseForm(dealTargetSchema, formData);
    await markDealPaid(getContainer(), { userId: session.user.id, dealId });
    revalidatePath(DEALS_PATH, 'layout');
  });
}

/** UC-R5: the creator confirms the payment arrived. */
export async function confirmPaymentAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const { dealId } = parseForm(dealTargetSchema, formData);
    await confirmPaymentReceived(getContainer(), { userId: session.user.id, dealId });
    revalidatePath(DEALS_PATH, 'layout');
  });
}

/** UC-R5: the creator says the payment didn't arrive (goes to the admins). */
export async function reportPaymentAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const input = parseForm(paymentDisputeSchema, formData);
    await reportPaymentNotReceived(getContainer(), { userId: session.user.id, ...input });
    revalidatePath(DEALS_PATH, 'layout');
  });
}

/** UC-R4: either side cancels, with a reason. */
export async function cancelDealAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const input = parseForm(cancelDealSchema, formData);
    await cancelDeal(getContainer(), { userId: session.user.id, ...input });
    revalidatePath(DEALS_PATH, 'layout');
  });
}
