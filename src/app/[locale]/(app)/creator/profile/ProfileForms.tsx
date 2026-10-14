'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FieldErrorText, FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { IDLE } from '@/lib/action-state';
import {
  portfolioItemSchema,
  profileDetailsSchema,
  rateCardSchema,
} from '@/lib/validation/creator-schemas';
import {
  addPortfolioItemAction,
  removePortfolioItemAction,
  saveProfileDetailsAction,
  saveRateCardAction,
  setAvailabilityAction,
  uploadPhotoAction,
} from '../actions';

export interface Option {
  readonly value: string;
  readonly label: string;
}

/** FR-2.1 / SR-9 photo upload. The server checks the real file type and scans it. */
export function PhotoForm() {
  const t = useTranslations('creator.profile');
  const tFields = useTranslations('fieldErrors');
  const [state, formAction] = useActionState(uploadPhotoAction, IDLE);
  const error = state.status === 'error' ? state.fieldErrors?.photo : undefined;
  return (
    <form action={formAction} className="grid gap-3">
      <FormStatus state={state} successMessage={t('saved')} />
      <Label htmlFor="field-photo">{t('upload')}</Label>
      <input
        id="field-photo"
        name="photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-describedby="field-photo-hint"
        className="text-sm"
      />
      <p id="field-photo-hint" className="text-muted-foreground text-xs">
        {t('photoHint')}
      </p>
      {error ? <FieldErrorText message={tFields(error)} /> : null}
      <SubmitButton variant="outline">{t('upload')}</SubmitButton>
    </form>
  );
}

function CheckboxGroup({
  name,
  legend,
  hint,
  options,
  selected,
  error,
}: {
  name: string;
  legend: string;
  hint: string;
  options: readonly Option[];
  selected: readonly string[];
  error?: string;
}) {
  const tFields = useTranslations('fieldErrors');
  return (
    <fieldset className="grid gap-2" aria-describedby={`${name}-hint`}>
      <legend className="text-sm font-medium">{legend}</legend>
      <p id={`${name}-hint`} className="text-muted-foreground text-xs">
        {hint}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={selected.includes(option.value)}
              className="accent-primary size-4"
            />
            {option.label}
          </label>
        ))}
      </div>
      {error ? <FieldErrorText message={tFields(error)} /> : null}
    </fieldset>
  );
}

/** FR-2.1 / UC-C1: name, bio, location, languages and categories. */
export function ProfileDetailsForm({
  profile,
  states,
  languages,
  categories,
}: {
  profile: {
    displayName: string;
    bio: string;
    city: string;
    stateCode: string;
    languageCodes: readonly string[];
    categorySlugs: readonly string[];
  };
  states: readonly Option[];
  languages: readonly Option[];
  categories: readonly Option[];
}) {
  const t = useTranslations('creator.profile');
  const tFields = useTranslations('fieldErrors');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    profileDetailsSchema,
    saveProfileDetailsAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} successMessage={t('saved')} />
      <FormField
        name="displayName"
        label={t('displayName')}
        defaultValue={profile.displayName}
        error={fieldErrors.displayName}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="field-bio">{t('bio')}</Label>
        <textarea
          id="field-bio"
          name="bio"
          rows={4}
          maxLength={500}
          defaultValue={profile.bio}
          aria-describedby="field-bio-hint"
          aria-invalid={fieldErrors.bio ? true : undefined}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 rounded-md border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-[3px] md:text-sm"
        />
        <p id="field-bio-hint" className="text-muted-foreground text-xs">
          {t('bioHint')}
        </p>
        {fieldErrors.bio ? <FieldErrorText message={tFields(fieldErrors.bio)} /> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="field-stateCode">{t('state')}</Label>
          <NativeSelect
            id="field-stateCode"
            name="stateCode"
            defaultValue={profile.stateCode}
            aria-invalid={fieldErrors.stateCode ? true : undefined}
          >
            <option value="">{t('statePlaceholder')}</option>
            {states.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
          {fieldErrors.stateCode ? (
            <FieldErrorText message={tFields(fieldErrors.stateCode)} />
          ) : null}
        </div>
        <FormField
          name="city"
          label={t('city')}
          defaultValue={profile.city}
          autoComplete="address-level2"
          error={fieldErrors.city}
        />
      </div>
      <CheckboxGroup
        name="languageCodes"
        legend={t('languages')}
        hint={t('languagesHint')}
        options={languages}
        selected={profile.languageCodes}
        error={fieldErrors.languageCodes}
      />
      <CheckboxGroup
        name="categorySlugs"
        legend={t('categories')}
        hint={t('categoriesHint')}
        options={categories}
        selected={profile.categorySlugs}
        error={fieldErrors.categorySlugs}
      />
      <SubmitButton>{t('saveDetails')}</SubmitButton>
    </form>
  );
}

/** UC-C6: open or closed to new requests. */
export function AvailabilityForm({ isOpen }: { isOpen: boolean }) {
  const t = useTranslations('creator.profile');
  const [state, formAction] = useActionState(setAvailabilityAction, IDLE);
  return (
    <form action={formAction} className="grid gap-3">
      <FormStatus state={state} />
      <p>{isOpen ? t('openNow') : t('closedNow')}</p>
      <input type="hidden" name="isOpen" value={isOpen ? 'false' : 'true'} />
      <SubmitButton variant="outline">{isOpen ? t('close') : t('open')}</SubmitButton>
    </form>
  );
}

/** UC-C6: prices per deliverable in rupees. */
export function RateCardForm({
  deliverables,
  rupeesByDeliverable,
}: {
  deliverables: readonly Option[];
  rupeesByDeliverable: Readonly<Record<string, number>>;
}) {
  const t = useTranslations('creator.profile');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    rateCardSchema,
    saveRateCardAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} successMessage={t('saved')} />
      <p className="text-muted-foreground text-sm">{t('rateCardHint')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {deliverables.map((option) => (
          <FormField
            key={option.value}
            name={option.value}
            label={`${option.label} (₹)`}
            inputMode="numeric"
            defaultValue={rupeesByDeliverable[option.value]?.toString() ?? ''}
            error={fieldErrors[option.value]}
          />
        ))}
      </div>
      <SubmitButton>{t('saveRates')}</SubmitButton>
    </form>
  );
}

/** FR-2.2: add a past brand collaboration. */
export function AddPortfolioItemForm() {
  const t = useTranslations('creator.profile');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    portfolioItemSchema,
    addPortfolioItemAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField name="brandName" label={t('brandName')} error={fieldErrors.brandName} />
        <FormField
          name="url"
          type="url"
          label={t('link')}
          placeholder="https://"
          error={fieldErrors.url}
        />
        <FormField
          name="collaboratedOn"
          type="date"
          label={t('date')}
          error={fieldErrors.collaboratedOn}
        />
      </div>
      <SubmitButton variant="outline">{t('addItem')}</SubmitButton>
    </form>
  );
}

/** FR-2.2: remove one portfolio item. */
export function RemovePortfolioItemButton({ itemId }: { itemId: string }) {
  const t = useTranslations('creator.profile');
  const [state, formAction] = useActionState(removePortfolioItemAction, IDLE);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={itemId} />
      <SubmitButton variant="ghost" size="sm">
        {t('remove')}
      </SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}
