'use client';

import { useTranslations } from 'next-intl';
import { CheckboxField } from '@/components/forms/CheckboxField';
import { FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { Turnstile } from '@/components/forms/Turnstile';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { Alert } from '@/components/ui/alert';
import { Link } from '@/i18n/navigation';
import { accessRequestSchema } from '@/lib/validation/account-schemas';
import { requestAccessAction } from '../actions';

/** Pilot waitlist form: who they are, and a link so the team can look them up. */
export function EarlyAccessForm({
  captchaSiteKey,
  nonce,
}: {
  readonly captchaSiteKey?: string;
  readonly nonce?: string;
}) {
  const t = useTranslations('auth.earlyAccess');
  const tSignUp = useTranslations('auth.signUp');
  const form = useValidatedForm(accessRequestSchema, requestAccessAction);
  const errors = form.fieldErrors;

  // The same answer whether or not the address was already known (no account discovery).
  if (form.state.status === 'success') {
    return <Alert variant="success">{t('thanks')}</Alert>;
  }

  return (
    <form action={form.formAction} onSubmit={form.onSubmit} noValidate className="grid gap-4">
      <FormStatus state={form.state} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{tSignUp('roleLegend')}</legend>
        {(['CREATOR', 'BRAND'] as const).map((value, index) => (
          <label
            key={value}
            className="has-checked:border-primary flex cursor-pointer items-start gap-3 rounded-md border p-3"
          >
            <input
              type="radio"
              name="role"
              value={value}
              defaultChecked={index === 0}
              className="accent-primary mt-1"
            />
            <span>
              <span className="block font-medium">
                {value === 'CREATOR' ? tSignUp('roleCreator') : tSignUp('roleBrand')}
              </span>
              <span className="text-muted-foreground block text-sm">
                {value === 'CREATOR' ? tSignUp('roleCreatorHint') : tSignUp('roleBrandHint')}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <FormField name="name" label={tSignUp('name')} autoComplete="name" error={errors.name} />
      <FormField
        name="email"
        type="email"
        label={tSignUp('email')}
        autoComplete="email"
        error={errors.email}
      />
      <FormField name="city" label={t('city')} autoComplete="address-level2" error={errors.city} />
      <FormField
        name="profileUrl"
        type="url"
        label={t('profileUrl')}
        hint={t('profileUrlHint')}
        placeholder="https://"
        error={errors.profileUrl}
      />
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

      <Turnstile siteKey={captchaSiteKey} nonce={nonce} />
      <SubmitButton>{t('submit')}</SubmitButton>

      <p className="text-sm">
        {t('alreadyInvited')}{' '}
        <Link href="/sign-up" className="underline">
          {t('signUpLink')}
        </Link>
      </p>
    </form>
  );
}
