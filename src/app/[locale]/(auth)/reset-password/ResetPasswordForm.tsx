'use client';

import { useTranslations } from 'next-intl';
import { FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { resetPasswordSchema } from '@/lib/validation/account-schemas';
import { resetPasswordAction } from '../actions';

/** UC-A3: choose a new password from a reset link. */
export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth.resetPassword');
  const tSignUp = useTranslations('auth.signUp');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    resetPasswordSchema,
    resetPasswordAction,
  );
  if (state.status === 'success') {
    return (
      <div className="grid gap-4">
        <FormStatus state={state} successMessage={t('success')} />
        <Button asChild>
          <Link href="/sign-in">{t('signIn')}</Link>
        </Button>
      </div>
    );
  }
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} />
      <input type="hidden" name="token" value={token} />
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
