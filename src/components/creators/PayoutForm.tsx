'use client';

import { useTranslations } from 'next-intl';
import { setUpPayoutAction } from '@/app/[locale]/(app)/creator/actions';
import { FieldErrorText, FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { payoutDetailsSchema } from '@/lib/validation/creator-schemas';

/**
 * ADR-013: the creator's KYC for payouts. Sent straight to the payment gateway; the
 * platform keeps only the gateway's account id and the account's last 4 digits.
 */
export function PayoutForm() {
  const t = useTranslations('payouts.form');
  const tFields = useTranslations('fieldErrors');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    payoutDetailsSchema,
    setUpPayoutAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} />
      {fieldErrors.details ? <FieldErrorText message={tFields(fieldErrors.details)} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="legalName"
          label={t('legalName')}
          hint={t('legalNameHint')}
          autoComplete="name"
          maxLength={100}
          error={fieldErrors.legalName}
        />
        <FormField
          name="pan"
          label={t('pan')}
          autoComplete="off"
          maxLength={10}
          className="uppercase"
          error={fieldErrors.pan}
        />
        <FormField
          name="phone"
          type="tel"
          label={t('phone')}
          hint={t('phoneHint')}
          autoComplete="tel-national"
          maxLength={16}
          error={fieldErrors.phone}
        />
        <FormField
          name="accountHolderName"
          label={t('accountHolderName')}
          maxLength={100}
          error={fieldErrors.accountHolderName}
        />
        <FormField
          name="accountNumber"
          label={t('accountNumber')}
          inputMode="numeric"
          autoComplete="off"
          maxLength={18}
          error={fieldErrors.accountNumber}
        />
        <FormField
          name="confirmAccountNumber"
          label={t('confirmAccountNumber')}
          inputMode="numeric"
          autoComplete="off"
          maxLength={18}
          error={fieldErrors.confirmAccountNumber}
        />
        <FormField
          name="ifsc"
          label={t('ifsc')}
          autoComplete="off"
          maxLength={11}
          className="uppercase"
          error={fieldErrors.ifsc}
        />
      </div>
      <p className="text-muted-foreground text-sm">{t('privacy')}</p>
      <SubmitButton className="w-fit">{t('submit')}</SubmitButton>
    </form>
  );
}
