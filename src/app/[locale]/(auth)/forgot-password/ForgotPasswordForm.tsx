'use client';

import { useTranslations } from 'next-intl';
import { FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { emailOnlySchema } from '@/lib/validation/account-schemas';
import { forgotPasswordAction } from '../actions';

/** UC-A3: request a reset link. The same message shows whether or not the email exists. */
export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgotPassword');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    emailOnlySchema,
    forgotPasswordAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} successMessage={t('sent')} />
      <FormField
        name="email"
        type="email"
        label={t('email')}
        autoComplete="email"
        error={fieldErrors.email}
      />
      <SubmitButton>{t('submit')}</SubmitButton>
    </form>
  );
}
