'use server';

import { revalidatePath } from 'next/cache';
import { getContainer } from '@/adapters/container';
import { type ActionState, runAction } from '@/lib/action';
import { requireActionSession } from '@/lib/auth/current-session';
import {
  acceptContractSchema,
  cancelDealSchema,
  dealTargetSchema,
  issueContractSchema,
  paymentDisputeSchema,
  postLinkSchema,
  reviewNoteSchema,
  submitWorkSchema,
} from '@/lib/validation/deal-schemas';
import { parseForm } from '@/lib/validation/form-data';
import { ratingFormSchema, reportRatingSchema, scoresFrom } from '@/lib/validation/rating-schemas';
import {
  acceptContract,
  addPostLink,
  approveWork,
  cancelDeal,
  confirmPaymentReceived,
  issueContract,
  markDealPaid,
  raiseDealDispute,
  reportPaymentNotReceived,
  requestChanges,
  submitWork,
} from '@/services/deals';
import { reportRating, submitRating } from '@/services/ratings';

const participantsOnly = () => requireActionSession({ roles: ['BRAND', 'CREATOR'] });
const DEALS_PATH = '/[locale]/deals';

/** Uploaded files from a form field; empty file inputs send one empty file. */
async function uploadedFiles(formData: FormData, field: string) {
  const files = formData.getAll(field).filter((file) => file instanceof File && file.size > 0);
  return Promise.all(
    (files as File[]).map(async (file) => ({
      bytes: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
    })),
  );
}

/** FR-9.2 / ADR-012: the brand issues the terms as a new contract version. */
export async function issueContractAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const input = parseForm(issueContractSchema, formData);
    const [file] = await uploadedFiles(formData, 'file');
    await issueContract(getContainer(), { userId: session.user.id, ...input, file: file ?? null });
    revalidatePath(DEALS_PATH, 'layout');
  });
}

/** ADR-012: the creator accepts the contract version they read. */
export async function acceptContractAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const input = parseForm(acceptContractSchema, formData);
    await acceptContract(getContainer(), { userId: session.user.id, ...input });
    revalidatePath(DEALS_PATH, 'layout');
  });
}

/** ADR-012: the creator submits proof of work; files are checked and scanned by the service. */
export async function submitWorkAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const input = parseForm(submitWorkSchema, formData);
    const files = await uploadedFiles(formData, 'files');
    await submitWork(getContainer(), { userId: session.user.id, ...input, files });
    revalidatePath(DEALS_PATH, 'layout');
  });
}

/** ADR-012: the brand approves the submitted work. */
export async function approveWorkAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const { dealId } = parseForm(dealTargetSchema, formData);
    await approveWork(getContainer(), { userId: session.user.id, dealId });
    revalidatePath(DEALS_PATH, 'layout');
  });
}

/** ADR-012: the brand asks for changes, saying what to change. */
export async function requestChangesAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const input = parseForm(reviewNoteSchema, formData);
    await requestChanges(getContainer(), { userId: session.user.id, ...input });
    revalidatePath(DEALS_PATH, 'layout');
  });
}

/** ADR-012: either side sends a disagreement about the work to the admins. */
export async function raiseDisputeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const input = parseForm(reviewNoteSchema, formData);
    await raiseDealDispute(getContainer(), { userId: session.user.id, ...input });
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

/** FR-10.1: rates the other side of a completed deal. */
export async function submitRatingAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const input = parseForm(ratingFormSchema, formData);
    await submitRating(getContainer(), {
      userId: session.user.id,
      dealId: input.dealId,
      scores: scoresFrom(input),
      comment: input.comment,
    });
    revalidatePath(DEALS_PATH, 'layout');
  });
}

/** FR-10.3: reports a rating as unfair. */
export async function reportRatingAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await participantsOnly();
    const input = parseForm(reportRatingSchema, formData);
    await reportRating(getContainer(), { userId: session.user.id, ...input });
  });
}
