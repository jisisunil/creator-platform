'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { IDLE } from '@/lib/action-state';
import { changeEmailSchema, changePasswordSchema } from '@/lib/validation/account-schemas';
import { changeEmailAction, changePasswordAction, setMarketingConsentAction } from './actions';

/** FR-1.3 change password. Google-only accounts have no current password to enter. */
export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations('settings.changePassword');
  const tSignUp = useTranslations('auth.signUp');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    changePasswordSchema,
    changePasswordAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} successMessage={t('success')} />
      {hasPassword ? (
        <FormField
          name="currentPassword"
          type="password"
          label={t('currentPassword')}
          autoComplete="current-password"
          error={fieldErrors.currentPassword}
        />
      ) : (
        <input type="hidden" name="currentPassword" value="" />
      )}
      <FormField
        name="newPassword"
        type="password"
        label={t('newPassword')}
        hint={tSignUp('passwordHint')}
        autoComplete="new-password"
        error={fieldErrors.newPassword}
      />
      <SubmitButton>{t('submit')}</SubmitButton>
    </form>
  );
}

/** UC-A4 change email: confirmed from a link sent to the new address. */
export function ChangeEmailForm({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations('settings.changeEmail');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    changeEmailSchema,
    changeEmailAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} successMessage={t('sent')} />
      <FormField
        name="newEmail"
        type="email"
        label={t('newEmail')}
        autoComplete="email"
        error={fieldErrors.newEmail}
      />
      {hasPassword ? (
        <FormField
          name="currentPassword"
          type="password"
          label={t('currentPassword')}
          autoComplete="current-password"
          error={fieldErrors.currentPassword}
        />
      ) : (
        <input type="hidden" name="currentPassword" value="" />
      )}
      <SubmitButton>{t('submit')}</SubmitButton>
    </form>
  );
}

/** PR-4: one click to give or withdraw marketing consent. */
export function MarketingConsentForm({ isGranted }: { isGranted: boolean }) {
  const t = useTranslations('settings.privacy');
  const [state, formAction] = useActionState(setMarketingConsentAction, IDLE);
  return (
    <form action={formAction} className="grid gap-3">
      <FormStatus state={state} />
      <p>{isGranted ? t('marketingOn') : t('marketingOff')}</p>
      <input type="hidden" name="isGranted" value={isGranted ? 'false' : 'true'} />
      <SubmitButton variant="outline">{isGranted ? t('turnOff') : t('turnOn')}</SubmitButton>
    </form>
  );
}
