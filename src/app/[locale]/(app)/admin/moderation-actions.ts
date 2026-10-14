'use server';

import { getLocale } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { type ActionState, runAction } from '@/lib/action';
import { requireActionSession } from '@/lib/auth/current-session';
import { getRequestInfo } from '@/lib/request-info';
import {
  closeReportSchema,
  openChatSchema,
  ratingVisibilitySchema,
  resolveDisputeSchema,
  reviewFlagSchema,
  warnUserSchema,
} from '@/lib/validation/admin-schemas';
import { parseForm } from '@/lib/validation/form-data';
import {
  closeReport,
  openChatForReview,
  resolveDispute,
  reviewFlag,
  setRatingHidden,
  warnUser,
} from '@/services/moderation';

/** Admins with a fresh two-factor check only (SR-4, SEC-11). */
const adminOnly = () => requireActionSession({ roles: ['ADMIN'] });
const ADMIN_PATH = '/[locale]/admin';

/** UC-M1: resolve or dismiss a report. */
export async function closeReportAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const locale = await getLocale();
  const request = await getRequestInfo(locale);
  return runAction(async () => {
    const session = await adminOnly();
    const input = parseForm(closeReportSchema, formData);
    await closeReport(getContainer(), { adminUserId: session.user.id, request, ...input });
    redirect(`/${locale}/admin/reports`);
  });
}

/** FR-10.3: hide or show a reported rating. */
export async function setRatingHiddenAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const request = await getRequestInfo(await getLocale());
  return runAction(async () => {
    const session = await adminOnly();
    const { ratingId, isHidden } = parseForm(ratingVisibilitySchema, formData);
    await setRatingHidden(getContainer(), {
      adminUserId: session.user.id,
      request,
      ratingId,
      isHidden,
    });
    revalidatePath(ADMIN_PATH, 'layout');
  });
}

/** UC-M1: warn the reported user by email. */
export async function warnUserAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const request = await getRequestInfo(await getLocale());
  return runAction(async () => {
    const session = await adminOnly();
    const { userId, reason } = parseForm(warnUserSchema, formData);
    await warnUser(getContainer(), { adminUserId: session.user.id, request, userId, reason });
  });
}

/** SEC-11: open a chat with a logged reason; goes to the read-only view. */
export async function openChatAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const locale = await getLocale();
  const request = await getRequestInfo(locale);
  return runAction(async () => {
    const session = await adminOnly();
    const input = parseForm(openChatSchema, formData);
    const grantId = await openChatForReview(getContainer(), {
      adminUserId: session.user.id,
      request,
      threadId: input.threadId,
      reportId: input.reportId ?? null,
      reason: input.reason,
    });
    redirect(`/${locale}/admin/chats/${grantId}`);
  });
}

/** UC-M2: clear a flag or mark it suspicious. */
export async function reviewFlagAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const request = await getRequestInfo(await getLocale());
  return runAction(async () => {
    const session = await adminOnly();
    const input = parseForm(reviewFlagSchema, formData);
    await reviewFlag(getContainer(), { adminUserId: session.user.id, request, ...input });
    revalidatePath(ADMIN_PATH, 'layout');
  });
}

/** UC-M3: decide who owns a disputed account. */
export async function resolveDisputeAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const request = await getRequestInfo(await getLocale());
  return runAction(async () => {
    const session = await adminOnly();
    const input = parseForm(resolveDisputeSchema, formData);
    await resolveDispute(getContainer(), { adminUserId: session.user.id, request, ...input });
    revalidatePath(ADMIN_PATH, 'layout');
  });
}
