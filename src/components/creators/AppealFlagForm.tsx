'use client';

import { useTranslations } from 'next-intl';
import { appealFlagAction } from '@/app/[locale]/(app)/creator/actions';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { TextareaField } from '@/components/forms/TextareaField';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { appealFlagSchema } from '@/lib/validation/creator-schemas';

/** UC-M2: explain why a "suspicious" decision is wrong; the flag goes back to review. */
export function AppealFlagForm({ flagId }: { flagId: string }) {
  const t = useTranslations('creator.analytics.flags');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    appealFlagSchema,
    appealFlagAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-2">
      <FormStatus state={state} successMessage={t('appealSent')} />
      <input type="hidden" name="flagId" value={flagId} />
      <TextareaField
        name="appealText"
        label={t('appealLabel')}
        hint={t('appealHint')}
        rows={3}
        maxLength={1000}
        error={fieldErrors.appealText}
      />
      <SubmitButton variant="outline" size="sm" className="w-fit">
        {t('appeal')}
      </SubmitButton>
    </form>
  );
}
