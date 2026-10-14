'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { IDLE } from '@/lib/action-state';
import { changeEmailSchema, changePasswordSchema } from '@/lib/validation/account-schemas';
import type { PreferenceSetting } from '@/services/notifications';
import {
  changeEmailAction,
  changePasswordAction,
  saveNotificationPreferencesAction,
  setMarketingConsentAction,
} from './actions';

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

/** FR-12.2: notification categories by channel; security emails are always sent. */
export function NotificationPreferencesForm({
  preferences,
}: {
  preferences: readonly PreferenceSetting[];
}) {
  const t = useTranslations('settings.notifications');
  const [state, formAction] = useActionState(saveNotificationPreferencesAction, IDLE);
  const categories = [...new Set(preferences.map((preference) => preference.category))];
  const channels = [...new Set(preferences.map((preference) => preference.channel))];
  return (
    <form action={formAction} className="grid gap-3">
      <FormStatus state={state} successMessage={t('saved')} />
      <table className="text-sm">
        <thead>
          <tr>
            <th scope="col" className="text-left font-medium">
              <span className="sr-only">{t('category')}</span>
            </th>
            {channels.map((channel) => (
              <th key={channel} scope="col" className="px-3 text-center font-medium">
                {t(`channels.${channel}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category} className="border-t">
              <th scope="row" className="py-2 text-left font-normal">
                {t(`categories.${category}`)}
              </th>
              {channels.map((channel) => {
                const setting = preferences.find(
                  (preference) =>
                    preference.category === category && preference.channel === channel,
                );
                return (
                  <td key={channel} className="px-3 text-center">
                    <input
                      type="checkbox"
                      name="enabled"
                      value={`${category}:${channel}`}
                      defaultChecked={setting?.isEnabled ?? true}
                      aria-label={t('toggleLabel', {
                        category: t(`categories.${category}`),
                        channel: t(`channels.${channel}`),
                      })}
                      className="accent-primary size-4"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted-foreground text-xs">{t('securityNote')}</p>
      <SubmitButton variant="outline" className="w-fit">
        {t('save')}
      </SubmitButton>
    </form>
  );
}
