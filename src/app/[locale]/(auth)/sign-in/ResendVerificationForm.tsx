'use client';

import { useTranslations } from 'next-intl';
import { FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { emailOnlySchema } from '@/lib/validation/account-schemas';
import { resendVerificationAction } from '../actions';

/** FR-1.1: asks for a fresh verification link. */
export function ResendVerificationForm() {
  const t = useTranslations('auth');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    emailOnlySchema,
    resendVerificationAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-3">
      <FormStatus state={state} successMessage={t('checkEmail.resent')} />
      <FormField
        name="email"
        type="email"
        label={t('signIn.email')}
        autoComplete="email"
        error={fieldErrors.email}
      />
      <SubmitButton variant="outline">{t('signIn.resendVerification')}</SubmitButton>
    </form>
  );
}
