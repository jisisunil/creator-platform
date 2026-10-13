'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CheckboxField } from '@/components/forms/CheckboxField';
import { FieldErrorText, FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { Turnstile } from '@/components/forms/Turnstile';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { BRAND_INDUSTRIES } from '@/config/industries';
import type { SelfServiceRole } from '@/domain/accounts';
import { Link } from '@/i18n/navigation';
import { signUpSchema } from '@/lib/validation/account-schemas';
import { signUpAction, startGoogleSignUpAction } from '../actions';

interface SignUpFormProps {
  readonly initialRole: SelfServiceRole;
  readonly isGoogleEnabled: boolean;
  readonly captchaSiteKey?: string;
  readonly nonce?: string;
}

/** UC-A1 sign-up: role, details, 18+ and privacy consent (unticked by default, PR-2). */
export function SignUpForm({
  initialRole,
  isGoogleEnabled,
  captchaSiteKey,
  nonce,
}: SignUpFormProps) {
  const t = useTranslations('auth.signUp');
  const tFields = useTranslations('fieldErrors');
  const tIndustries = useTranslations('industries');
  const [role, setRole] = useState<SelfServiceRole>(initialRole);
  const signUp = useValidatedForm(signUpSchema, signUpAction);
  const google = useValidatedForm(signUpSchema, startGoogleSignUpAction);
  const errors = { ...google.fieldErrors, ...signUp.fieldErrors };
  const state = google.state.status === 'error' ? google.state : signUp.state;

  return (
    <form action={signUp.formAction} onSubmit={signUp.onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t('roleLegend')}</legend>
        {(['CREATOR', 'BRAND'] as const).map((value) => (
          <label
            key={value}
            className="has-checked:border-primary flex cursor-pointer items-start gap-3 rounded-md border p-3"
          >
            <input
              type="radio"
              name="role"
              value={value}
              checked={role === value}
              onChange={() => setRole(value)}
              className="accent-primary mt-1"
            />
            <span>
              <span className="block font-medium">
                {value === 'CREATOR' ? t('roleCreator') : t('roleBrand')}
              </span>
              <span className="text-muted-foreground block text-sm">
                {value === 'CREATOR' ? t('roleCreatorHint') : t('roleBrandHint')}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <FormField name="name" label={t('name')} autoComplete="name" error={errors.name} />
      <FormField
        name="email"
        type="email"
        label={t('email')}
        autoComplete="email"
        error={errors.email}
      />
      <FormField
        name="password"
        type="password"
        label={t('password')}
        hint={t('passwordHint')}
        autoComplete="new-password"
        error={errors.password}
      />

      {role === 'BRAND' ? (
        <>
          <FormField
            name="brandName"
            label={t('brandName')}
            autoComplete="organization"
            error={errors.brandName}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="field-industry">{t('industry')}</Label>
            <NativeSelect
              id="field-industry"
              name="industry"
              defaultValue=""
              aria-invalid={errors.industry ? true : undefined}
              aria-describedby={errors.industry ? 'field-industry-error' : undefined}
            >
              <option value="" disabled>
                {t('industryPlaceholder')}
              </option>
              {BRAND_INDUSTRIES.map((industry) => (
                <option key={industry} value={industry}>
                  {tIndustries(industry)}
                </option>
              ))}
            </NativeSelect>
            {errors.industry ? (
              <FieldErrorText id="field-industry-error" message={tFields(errors.industry)} />
            ) : null}
          </div>
        </>
      ) : null}

      <CheckboxField name="isAdult" label={t('ageConfirmation')} error={errors.isAdult} />
      <CheckboxField
        name="acceptsPrivacyNotice"
        label={t.rich('privacyConsent', {
          link: (chunks) => (
            <Link href="/privacy" target="_blank" className="underline">
              {chunks}
            </Link>
          ),
        })}
        error={errors.acceptsPrivacyNotice}
      />
      <CheckboxField name="acceptsMarketing" label={t('marketingConsent')} />

      <Turnstile siteKey={captchaSiteKey} nonce={nonce} />
      <SubmitButton>{t('submit')}</SubmitButton>

      {isGoogleEnabled ? (
        <div className="grid gap-2">
          <p className="text-muted-foreground text-center text-sm">{t('googleNote')}</p>
          <SubmitButton variant="outline" formAction={google.formAction} formNoValidate>
            {t('googleButton')}
          </SubmitButton>
        </div>
      ) : null}

      <p className="text-sm">
        {t('haveAccount')}{' '}
        <Link href="/sign-in" className="underline">
          {t('signInLink')}
        </Link>
      </p>
    </form>
  );
}
