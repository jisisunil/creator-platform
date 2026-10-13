'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { CheckboxField } from '@/components/forms/CheckboxField';
import { FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { Link } from '@/i18n/navigation';
import { IDLE } from '@/lib/action-state';
import { acceptInviteSchema } from '@/lib/validation/account-schemas';
import { acceptInviteAsSignedInUserAction, acceptInviteWithNewAccountAction } from './actions';

/** UC-A6: new person accepts an invite by creating their account (with consent, PR-2). */
export function AcceptInviteNewAccountForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    acceptInviteSchema,
    acceptInviteWithNewAccountAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} />
      <input type="hidden" name="token" value={token} />
      <FormField
        name="name"
        label={t('invite.name')}
        autoComplete="name"
        error={fieldErrors.name}
      />
      <FormField
        name="password"
        type="password"
        label={t('invite.password')}
        hint={t('signUp.passwordHint')}
        autoComplete="new-password"
        error={fieldErrors.password ?? fieldErrors.email}
      />
      <CheckboxField
        name="isAdult"
        label={t('signUp.ageConfirmation')}
        error={fieldErrors.isAdult}
      />
      <CheckboxField
        name="acceptsPrivacyNotice"
        label={t.rich('signUp.privacyConsent', {
          link: (chunks) => (
            <Link href="/privacy" target="_blank" className="underline">
              {chunks}
            </Link>
          ),
        })}
        error={fieldErrors.acceptsPrivacyNotice}
      />
      <CheckboxField name="acceptsMarketing" label={t('signUp.marketingConsent')} />
      <SubmitButton>{t('invite.submit')}</SubmitButton>
    </form>
  );
}

/** UC-A6: signed-in brand user joins with one click. */
export function AcceptInviteSignedInForm({ token }: { token: string }) {
  const t = useTranslations('auth.invite');
  const [state, formAction] = useActionState(acceptInviteAsSignedInUserAction, IDLE);
  return (
    <form action={formAction} className="grid gap-4">
      <FormStatus state={state} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton>{t('accept')}</SubmitButton>
    </form>
  );
}
