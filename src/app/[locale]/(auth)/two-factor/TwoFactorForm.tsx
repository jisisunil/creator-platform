'use client';

import { useTranslations } from 'next-intl';
import { FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { twoFactorCodeSchema } from '@/lib/validation/account-schemas';
import { twoFactorAction } from '../actions';

/** SR-4: enter the 6-digit TOTP code. */
export function TwoFactorForm() {
  const t = useTranslations('auth.twoFactor');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    twoFactorCodeSchema,
    twoFactorAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} />
      <FormField
        name="code"
        label={t('code')}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        error={fieldErrors.code}
      />
      <SubmitButton>{t('submit')}</SubmitButton>
    </form>
  );
}
