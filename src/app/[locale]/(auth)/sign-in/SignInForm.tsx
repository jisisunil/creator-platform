'use client';

import { useTranslations } from 'next-intl';
import { FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { Turnstile } from '@/components/forms/Turnstile';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { Link } from '@/i18n/navigation';
import { linkGoogleSchema, signInSchema } from '@/lib/validation/account-schemas';
import { linkGoogleAction, signInAction } from '../actions';
import { ResendVerificationForm } from './ResendVerificationForm';

interface CaptchaProps {
  /** The server already knows this IP needs a CAPTCHA (SR-3). */
  readonly isCaptchaNeeded: boolean;
  readonly captchaSiteKey?: string;
  readonly nonce?: string;
}

/** UC-A2 email and password sign-in. */
export function SignInForm({ isCaptchaNeeded, captchaSiteKey, nonce }: CaptchaProps) {
  const t = useTranslations('auth.signIn');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(signInSchema, signInAction);
  // After any failure a CAPTCHA may be needed for the next attempt; show it pre-emptively.
  const showCaptcha = isCaptchaNeeded || state.status === 'error';

  return (
    <div className="grid gap-4">
      <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
        <FormStatus state={state} />
        <FormField
          name="email"
          type="email"
          label={t('email')}
          autoComplete="email"
          error={fieldErrors.email}
        />
        <FormField
          name="password"
          type="password"
          label={t('password')}
          autoComplete="current-password"
          error={fieldErrors.password}
        />
        {showCaptcha ? <Turnstile siteKey={captchaSiteKey} nonce={nonce} /> : null}
        <SubmitButton>{t('submit')}</SubmitButton>
        <Link href="/forgot-password" className="text-sm underline">
          {t('forgotPassword')}
        </Link>
      </form>
      {state.status === 'error' && state.code === 'EMAIL_NOT_VERIFIED' ? (
        <ResendVerificationForm />
      ) : null}
    </div>
  );
}

/** UC-A2 edge case: confirm the existing account's password before linking Google. */
export function LinkGoogleForm({ isCaptchaNeeded, captchaSiteKey, nonce }: CaptchaProps) {
  const t = useTranslations('auth.signIn');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    linkGoogleSchema,
    linkGoogleAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} />
      <FormField
        name="password"
        type="password"
        label={t('password')}
        autoComplete="current-password"
        error={fieldErrors.password}
      />
      {isCaptchaNeeded || state.status === 'error' ? (
        <Turnstile siteKey={captchaSiteKey} nonce={nonce} />
      ) : null}
      <SubmitButton>{t('linkGoogleSubmit')}</SubmitButton>
    </form>
  );
}
