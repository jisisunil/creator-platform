'use client';

import { useTranslations } from 'next-intl';
import { reportRatingAction, submitRatingAction } from '@/app/[locale]/(app)/deals/actions';
import { FieldErrorText } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { TextareaField } from '@/components/forms/TextareaField';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { RATING_RULES, REPORT_REASON_MAX } from '@/config/collaboration';
import { MAX_STARS, MIN_STARS, type RatingCriterion } from '@/domain/ratings';
import { ratingFormSchema, reportRatingSchema } from '@/lib/validation/rating-schemas';

const STAR_VALUES = Array.from(
  { length: MAX_STARS - MIN_STARS + 1 },
  (_, index) => index + MIN_STARS,
);

/** FR-10.1: 1-5 stars on each fixed criterion, plus an optional comment. */
export function RatingForm({
  dealId,
  criteria,
  otherPartyName,
}: {
  dealId: string;
  criteria: readonly RatingCriterion[];
  otherPartyName: string;
}) {
  const t = useTranslations('ratings');
  const tFields = useTranslations('fieldErrors');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    ratingFormSchema,
    submitRatingAction,
  );
  const scoresError =
    fieldErrors.scores ?? criteria.map((criterion) => fieldErrors[criterion]).find(Boolean);
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} successMessage={t('thanks')} />
      <input type="hidden" name="dealId" value={dealId} />
      {criteria.map((criterion) => (
        <fieldset key={criterion} className="grid gap-1">
          <legend className="text-sm font-medium">
            {t(`criteria.${criterion}`, { name: otherPartyName })}
          </legend>
          <div className="flex flex-wrap gap-3">
            {STAR_VALUES.map((value) => (
              <label key={value} className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name={criterion}
                  value={value}
                  required
                  className="accent-primary size-4"
                />
                <span>{t('stars', { count: value })}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {scoresError ? <FieldErrorText message={tFields(scoresError)} /> : null}
      <TextareaField
        name="comment"
        label={t('comment')}
        hint={t('commentHint')}
        rows={3}
        maxLength={RATING_RULES.commentMax}
        error={fieldErrors.comment}
      />
      <SubmitButton className="w-fit">{t('submit')}</SubmitButton>
    </form>
  );
}

/** FR-10.3: report a rating as unfair. */
export function ReportRatingForm({ ratingId }: { ratingId: string }) {
  const t = useTranslations('ratings.report');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    reportRatingSchema,
    reportRatingAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-2">
      <FormStatus state={state} successMessage={t('sent')} />
      <input type="hidden" name="ratingId" value={ratingId} />
      <TextareaField
        name="reason"
        label={t('reason')}
        rows={2}
        maxLength={REPORT_REASON_MAX}
        error={fieldErrors.reason}
      />
      <SubmitButton variant="outline" size="sm" className="w-fit">
        {t('submit')}
      </SubmitButton>
    </form>
  );
}
