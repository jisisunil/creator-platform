'use server';

import { getLocale } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { getContainer } from '@/adapters/container';
import { type ActionState, runAction } from '@/lib/action';
import { requireActionSession } from '@/lib/auth/current-session';
import { getRequestInfo } from '@/lib/request-info';
import {
  addCreditPackSchema,
  changePlanSchema,
  extendTrialSchema,
  freeBetaSchema,
  suspendUserSchema,
  userTargetSchema,
} from '@/lib/validation/admin-schemas';
import { parseForm } from '@/lib/validation/form-data';
import {
  refreshCreatorNow,
  reinstateUser,
  setFreeBeta,
  suspendUser,
  verifyUserEmail,
} from '@/services/admin';
import { addCreditPack, changeBrandPlan, extendTrial } from '@/services/plans';

/** Admins with a fresh two-factor check only (SR-4, SEC-11). */
const adminOnly = () => requireActionSession({ roles: ['ADMIN'] });
const ADMIN_PATH = '/[locale]/admin';

async function requestInfo() {
  return getRequestInfo(await getLocale());
}

/** FR-13.1 / UC-M1. */
export async function suspendUserAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const request = await requestInfo();
  return runAction(async () => {
    const session = await adminOnly();
    const input = parseForm(suspendUserSchema, formData);
    await suspendUser(getContainer(), { adminUserId: session.user.id, ...input, request });
    revalidatePath(ADMIN_PATH, 'layout');
  });
}

/** FR-13.1. */
export async function reinstateUserAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const request = await requestInfo();
  return runAction(async () => {
    const session = await adminOnly();
    const { userId } = parseForm(userTargetSchema, formData);
    await reinstateUser(getContainer(), { adminUserId: session.user.id, userId, request });
    revalidatePath(ADMIN_PATH, 'layout');
  });
}

/** FR-13.1. */
export async function verifyUserEmailAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const request = await requestInfo();
  return runAction(async () => {
    const session = await adminOnly();
    const { userId } = parseForm(userTargetSchema, formData);
    await verifyUserEmail(getContainer(), { adminUserId: session.user.id, userId, request });
    revalidatePath(ADMIN_PATH, 'layout');
  });
}

/** FR-13.2. */
export async function refreshCreatorAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const request = await requestInfo();
  return runAction(async () => {
    const session = await adminOnly();
    const { userId } = parseForm(userTargetSchema, formData);
    await refreshCreatorNow(getContainer(), { adminUserId: session.user.id, userId, request });
  });
}

/** FR-11.3 / UC-B3. */
export async function changePlanAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await adminOnly();
    const { brandId, planCode } = parseForm(changePlanSchema, formData);
    await changeBrandPlan(getContainer(), { adminUserId: session.user.id, brandId, planCode });
    revalidatePath(ADMIN_PATH, 'layout');
  });
}

/** FR-11.3. */
export async function extendTrialAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await adminOnly();
    const { brandId, days } = parseForm(extendTrialSchema, formData);
    await extendTrial(getContainer(), { adminUserId: session.user.id, brandId, days });
    revalidatePath(ADMIN_PATH, 'layout');
  });
}

/** Pay-as-you-go: adds a credit pack after payment. */
export async function addCreditPackAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await adminOnly();
    const { brandId, packCode } = parseForm(addCreditPackSchema, formData);
    await addCreditPack(getContainer(), { adminUserId: session.user.id, brandId, packCode });
    revalidatePath(ADMIN_PATH, 'layout');
  });
}

/** UC-B1: new brands start on the free beta or a trial. */
export async function setFreeBetaAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const request = await requestInfo();
  return runAction(async () => {
    const session = await adminOnly();
    const { isActive } = parseForm(freeBetaSchema, formData);
    await setFreeBeta(getContainer(), { adminUserId: session.user.id, isActive, request });
    revalidatePath(ADMIN_PATH, 'layout');
  });
}
