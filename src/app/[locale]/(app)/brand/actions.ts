'use server';

import { getLocale } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { type ActionState, runAction } from '@/lib/action';
import { requireActionSession } from '@/lib/auth/current-session';
import {
  addToShortlistSchema,
  renameShortlistSchema,
  savedSearchTargetSchema,
  shortlistItemSchema,
  shortlistNameSchema,
  shortlistNoteSchema,
  shortlistShareSchema,
  shortlistTargetSchema,
} from '@/lib/validation/discovery-schemas';
import { parseForm } from '@/lib/validation/form-data';
import {
  paramsFromQuery,
  parseSearchParams,
  saveSearchSchema,
} from '@/lib/validation/search-schemas';
import { deleteSavedSearch, saveSearch } from '@/services/discovery';
import {
  addToShortlist,
  createShortlist,
  deleteShortlist,
  removeFromShortlist,
  renameShortlist,
  setShortlistNote,
  setShortlistShared,
} from '@/services/shortlists';

const brandOnly = () => requireActionSession({ roles: ['BRAND'] });
const SHORTLISTS_PATH = '/[locale]/brand/shortlists';

/** Distinguishes "added" from "already there" for the add-to-shortlist control (UC-D3). */
export type AddToShortlistState = ActionState | { readonly status: 'duplicate' };

/** FR-6.1. */
export async function createShortlistAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const session = await brandOnly();
    const { name } = parseForm(shortlistNameSchema, formData);
    const id = await createShortlist(getContainer(), { userId: session.user.id, name });
    redirect(`/${locale}/brand/shortlists/${id}`);
  });
}

/** FR-6.1 / UC-D3: duplicates are reported, not errors. */
export async function addToShortlistAction(
  _: AddToShortlistState,
  formData: FormData,
): Promise<AddToShortlistState> {
  let wasAdded = true;
  const state = await runAction(async () => {
    const session = await brandOnly();
    const input = parseForm(addToShortlistSchema, formData);
    ({ wasAdded } = await addToShortlist(getContainer(), { userId: session.user.id, ...input }));
    revalidatePath(SHORTLISTS_PATH, 'layout');
  });
  return state.status === 'success' && !wasAdded ? { status: 'duplicate' } : state;
}

/** FR-6.1. */
export async function removeFromShortlistAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await brandOnly();
    const input = parseForm(shortlistItemSchema, formData);
    await removeFromShortlist(getContainer(), { userId: session.user.id, ...input });
    revalidatePath(SHORTLISTS_PATH, 'layout');
  });
}

/** FR-6.1. */
export async function setShortlistNoteAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await brandOnly();
    const input = parseForm(shortlistNoteSchema, formData);
    await setShortlistNote(getContainer(), { userId: session.user.id, ...input });
  });
}

/** FR-6.1. */
export async function renameShortlistAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await brandOnly();
    const input = parseForm(renameShortlistSchema, formData);
    await renameShortlist(getContainer(), { userId: session.user.id, ...input });
    revalidatePath(SHORTLISTS_PATH, 'layout');
  });
}

/** FR-6.1: share with the team or make private. */
export async function setShortlistSharedAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await brandOnly();
    const input = parseForm(shortlistShareSchema, formData);
    await setShortlistShared(getContainer(), { userId: session.user.id, ...input });
    revalidatePath(SHORTLISTS_PATH, 'layout');
  });
}

/** FR-6.1. */
export async function deleteShortlistAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const session = await brandOnly();
    const { shortlistId } = parseForm(shortlistTargetSchema, formData);
    await deleteShortlist(getContainer(), { userId: session.user.id, shortlistId });
    redirect(`/${locale}/brand/shortlists`);
  });
}

/** FR-5.4: saves the filters from the current search URL. */
export async function saveSearchAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await brandOnly();
    const { name, query } = parseForm(saveSearchSchema, formData);
    await saveSearch(getContainer(), {
      userId: session.user.id,
      name,
      filters: parseSearchParams(paramsFromQuery(query)).filters,
    });
    revalidatePath('/[locale]/brand/saved-searches', 'page');
  });
}

/** FR-5.4. */
export async function deleteSavedSearchAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await brandOnly();
    const { savedSearchId } = parseForm(savedSearchTargetSchema, formData);
    await deleteSavedSearch(getContainer(), { userId: session.user.id, savedSearchId });
    revalidatePath('/[locale]/brand/saved-searches', 'page');
  });
}
