'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  type AddToShortlistState,
  addToShortlistAction,
  createShortlistAction,
  deleteSavedSearchAction,
  deleteShortlistAction,
  removeFromShortlistAction,
  renameShortlistAction,
  saveSearchAction,
  setShortlistNoteAction,
  setShortlistSharedAction,
} from '@/app/[locale]/(app)/brand/actions';
import { FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { IDLE } from '@/lib/action-state';
import { shortlistNameSchema } from '@/lib/validation/discovery-schemas';
import { saveSearchSchema } from '@/lib/validation/search-schemas';

/** FR-6.1 / UC-D3: add a creator to one of the brand's shortlists. */
export function AddToShortlistForm({
  creatorId,
  shortlists,
}: {
  creatorId: string;
  shortlists: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('brand.shortlists');
  const [state, formAction] = useActionState<AddToShortlistState, FormData>(
    addToShortlistAction,
    IDLE,
  );
  if (shortlists.length === 0) {
    return <p className="text-muted-foreground text-xs">{t('noLists')}</p>;
  }
  const selectId = `shortlist-for-${creatorId}`;
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="creatorId" value={creatorId} />
      <div className="grid min-w-40 flex-1 gap-1">
        <Label htmlFor={selectId} className="text-xs">
          {t('chooseList')}
        </Label>
        <NativeSelect id={selectId} name="shortlistId" className="h-8 text-sm">
          {shortlists.map((shortlist) => (
            <option key={shortlist.id} value={shortlist.id}>
              {shortlist.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <SubmitButton size="sm" variant="outline">
        {t('add')}
      </SubmitButton>
      <p role="status" className="w-full text-xs">
        {state.status === 'success' ? t('added') : null}
        {state.status === 'duplicate' ? t('alreadyThere') : null}
      </p>
      {state.status === 'error' ? <FormStatus state={state} /> : null}
    </form>
  );
}

/** FR-6.1: create a shortlist. */
export function CreateShortlistForm() {
  const t = useTranslations('brand.shortlists');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    shortlistNameSchema,
    createShortlistAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-3">
      <FormStatus state={state} />
      <FormField name="name" label={t('name')} error={fieldErrors.name} />
      <SubmitButton>{t('create')}</SubmitButton>
    </form>
  );
}

/** FR-5.4: save the current search under a name. */
export function SaveSearchForm({ query }: { query: string }) {
  const t = useTranslations('brand.search');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    saveSearchSchema,
    saveSearchAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-3">
      <FormStatus state={state} successMessage={t('saved')} />
      <input type="hidden" name="query" value={query} />
      <FormField name="name" label={t('saveName')} error={fieldErrors.name} />
      <SubmitButton variant="outline">{t('save')}</SubmitButton>
    </form>
  );
}

/** FR-5.4: delete a saved search. */
export function DeleteSavedSearchButton({ savedSearchId }: { savedSearchId: string }) {
  const t = useTranslations('brand.savedSearches');
  const [state, formAction] = useActionState(deleteSavedSearchAction, IDLE);
  return (
    <form action={formAction}>
      <input type="hidden" name="savedSearchId" value={savedSearchId} />
      <SubmitButton variant="ghost" size="sm">
        {t('delete')}
      </SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}

/** FR-6.1: one creator's note on a shortlist. */
export function ShortlistNoteForm({
  shortlistId,
  itemId,
  note,
}: {
  shortlistId: string;
  itemId: string;
  note: string;
}) {
  const t = useTranslations('brand.shortlists');
  const [state, formAction] = useActionState(setShortlistNoteAction, IDLE);
  const fieldId = `note-${itemId}`;
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="shortlistId" value={shortlistId} />
      <input type="hidden" name="itemId" value={itemId} />
      <Label htmlFor={fieldId} className="text-xs">
        {t('note')}
      </Label>
      <textarea
        id={fieldId}
        name="note"
        rows={2}
        maxLength={500}
        defaultValue={note}
        className="border-input rounded-md border bg-transparent px-2 py-1 text-sm"
      />
      <div className="flex items-center gap-2">
        <SubmitButton size="sm" variant="outline">
          {t('saveNote')}
        </SubmitButton>
        <FormStatus state={state} successMessage={t('noteSaved')} />
      </div>
    </form>
  );
}

/** FR-6.1: remove one creator from a shortlist. */
export function RemoveFromShortlistButton({
  shortlistId,
  itemId,
}: {
  shortlistId: string;
  itemId: string;
}) {
  const t = useTranslations('brand.shortlists');
  const [state, formAction] = useActionState(removeFromShortlistAction, IDLE);
  return (
    <form action={formAction}>
      <input type="hidden" name="shortlistId" value={shortlistId} />
      <input type="hidden" name="itemId" value={itemId} />
      <SubmitButton size="sm" variant="ghost">
        {t('remove')}
      </SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}

/** FR-6.1: owner controls: rename, share with team, delete. */
export function ShortlistOwnerControls({
  shortlistId,
  name,
  isShared,
}: {
  shortlistId: string;
  name: string;
  isShared: boolean;
}) {
  const t = useTranslations('brand.shortlists');
  const [renameState, renameAction] = useActionState(renameShortlistAction, IDLE);
  const [shareState, shareAction] = useActionState(setShortlistSharedAction, IDLE);
  const [deleteState, deleteAction] = useActionState(deleteShortlistAction, IDLE);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <form action={renameAction} className="grid gap-2">
        <input type="hidden" name="shortlistId" value={shortlistId} />
        <FormField name="name" label={t('rename')} defaultValue={name} />
        <SubmitButton size="sm" variant="outline">
          {t('rename')}
        </SubmitButton>
        <FormStatus state={renameState} />
      </form>
      <form action={shareAction} className="grid content-end gap-2">
        <input type="hidden" name="shortlistId" value={shortlistId} />
        <input type="hidden" name="isShared" value={isShared ? 'false' : 'true'} />
        <SubmitButton size="sm" variant="outline">
          {isShared ? t('unshare') : t('share')}
        </SubmitButton>
        <FormStatus state={shareState} />
      </form>
      <form
        action={deleteAction}
        onSubmit={(event) => {
          if (!window.confirm(t('deleteConfirm'))) event.preventDefault();
        }}
        className="grid content-end gap-2"
      >
        <input type="hidden" name="shortlistId" value={shortlistId} />
        <SubmitButton size="sm" variant="destructive">
          {t('delete')}
        </SubmitButton>
        <FormStatus state={deleteState} />
      </form>
    </div>
  );
}
