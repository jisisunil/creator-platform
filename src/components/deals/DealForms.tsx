'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import {
  acceptContractAction,
  addPostLinkAction,
  approveWorkAction,
  cancelDealAction,
  confirmPaymentAction,
  issueContractAction,
  markDealPaidAction,
  raiseDisputeAction,
  reportPaymentAction,
  requestChangesAction,
  submitWorkAction,
} from '@/app/[locale]/(app)/deals/actions';
import { CheckboxField } from '@/components/forms/CheckboxField';
import { FieldErrorText, FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { TextareaField } from '@/components/forms/TextareaField';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DEAL_CONTRACT, DEAL_LIMITS, WORK_REVIEW } from '@/config/collaboration';
import { IDLE } from '@/lib/action-state';
import {
  acceptContractSchema,
  cancelDealSchema,
  issueContractSchema,
  paymentDisputeSchema,
  postLinkSchema,
  reviewNoteSchema,
  submitWorkSchema,
} from '@/lib/validation/deal-schemas';

/** A file picker with its label, hint and error (the service checks the files themselves). */
function FileField({
  name,
  label,
  hint,
  accept,
  isMultiple = false,
  error,
}: {
  name: string;
  label: string;
  hint: string;
  accept: string;
  isMultiple?: boolean;
  error?: string;
}) {
  const tFields = useTranslations('fieldErrors');
  const id = `field-${name}-${useId()}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        multiple={isMultiple}
        aria-describedby={`${id}-hint`}
        className="text-sm"
      />
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
        {hint}
      </p>
      {error ? <FieldErrorText message={tFields(error)} /> : null}
    </div>
  );
}

/**
 * FR-9.2 / ADR-012: the brand sets the amount and payment terms and issues them as a
 * contract: the standard one or its own PDF. Each issue is a new version to accept.
 */
export function ContractForm({
  dealId,
  amountRupees,
  advancePercent,
  paymentDueOn,
  additionalTerms,
  hasUploadedFile,
  hasAdvance,
}: {
  dealId: string;
  amountRupees: number | null;
  advancePercent: number | null;
  paymentDueOn: string | null;
  additionalTerms: string | null;
  /** The current version is the brand's own PDF (kept unless a new one is chosen). */
  hasUploadedFile: boolean;
  /** Direct payment allows an advance; escrow holds the whole amount until approval. */
  hasAdvance: boolean;
}) {
  const t = useTranslations('deals.contract.form');
  const tFields = useTranslations('fieldErrors');
  const [source, setSource] = useState<'GENERATED' | 'UPLOADED'>(
    hasUploadedFile ? 'UPLOADED' : 'GENERATED',
  );
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    issueContractSchema,
    issueContractAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} />
      <input type="hidden" name="dealId" value={dealId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          name="amountRupees"
          label={t('amount')}
          inputMode="numeric"
          required
          defaultValue={amountRupees ?? ''}
          error={fieldErrors.amountRupees}
        />
        {hasAdvance ? (
          <FormField
            name="advancePercent"
            label={t('advancePercent')}
            inputMode="numeric"
            defaultValue={advancePercent ?? ''}
            error={fieldErrors.advancePercent}
          />
        ) : (
          <input type="hidden" name="advancePercent" value="" />
        )}
        <FormField
          name="paymentDueOn"
          type="date"
          label={t('dueOn')}
          hint={t('dueOnHint')}
          defaultValue={paymentDueOn ?? ''}
          error={fieldErrors.paymentDueOn}
        />
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{t('source')}</legend>
        {(['GENERATED', 'UPLOADED'] as const).map((option) => (
          <label key={option} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="source"
              value={option}
              checked={source === option}
              onChange={() => setSource(option)}
              className="accent-primary mt-0.5 size-4"
            />
            <span>{t(`sources.${option}`)}</span>
          </label>
        ))}
        {fieldErrors.source ? <FieldErrorText message={tFields(fieldErrors.source)} /> : null}
      </fieldset>
      {source === 'UPLOADED' ? (
        <FileField
          name="file"
          label={t('file')}
          hint={hasUploadedFile ? t('fileKeepHint') : t('fileHint')}
          accept="application/pdf"
          error={fieldErrors.file}
        />
      ) : null}
      <TextareaField
        name="additionalTerms"
        label={t('additionalTerms')}
        hint={t('additionalTermsHint')}
        rows={4}
        maxLength={DEAL_CONTRACT.additionalTermsMax}
        defaultValue={additionalTerms ?? ''}
        error={fieldErrors.additionalTerms}
      />
      <p className="text-muted-foreground text-sm">{t('note')}</p>
      <SubmitButton className="w-fit">{t('issue')}</SubmitButton>
    </form>
  );
}

/** ADR-012: the creator accepts the exact contract version shown. */
export function AcceptContractForm({
  dealId,
  fingerprint,
}: {
  dealId: string;
  fingerprint: string;
}) {
  const t = useTranslations('deals.contract.acceptForm');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    acceptContractSchema,
    acceptContractAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-3">
      <FormStatus state={state} />
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="fingerprint" value={fingerprint} />
      <CheckboxField name="hasAgreed" label={t('agree')} error={fieldErrors.hasAgreed} />
      <SubmitButton className="w-fit">{t('accept')}</SubmitButton>
    </form>
  );
}

/** ADR-012: the creator's proof of work: links and/or screenshots, with a note. */
export function SubmitWorkForm({ dealId }: { dealId: string }) {
  const t = useTranslations('deals.work');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    submitWorkSchema,
    submitWorkAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-3">
      <FormStatus state={state} />
      <input type="hidden" name="dealId" value={dealId} />
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('disclosure')}</p>
      <TextareaField
        name="links"
        label={t('links')}
        hint={t('linksHint', { max: WORK_REVIEW.linksMax })}
        rows={3}
        error={fieldErrors.links}
      />
      <FileField
        name="files"
        label={t('files')}
        hint={t('filesHint', { max: WORK_REVIEW.filesMax })}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        isMultiple
        error={fieldErrors.files}
      />
      <TextareaField
        name="note"
        label={t('note')}
        rows={3}
        maxLength={WORK_REVIEW.noteMax}
        error={fieldErrors.note}
      />
      <SubmitButton className="w-fit">{t('submit')}</SubmitButton>
    </form>
  );
}

/** ADR-012: the brand approves the work or asks for changes (while rounds are left). */
export function ReviewWorkForms({
  dealId,
  canRequestChanges,
  changeRequestsLeft,
}: {
  dealId: string;
  canRequestChanges: boolean;
  changeRequestsLeft: number;
}) {
  const t = useTranslations('deals.work');
  const [approveState, approveAction] = useActionState(approveWorkAction, IDLE);
  const changes = useValidatedForm(reviewNoteSchema, requestChangesAction);
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <form
        action={approveAction}
        onSubmit={(event) => {
          if (!window.confirm(t('approveConfirm'))) event.preventDefault();
        }}
        className="grid content-start gap-2"
      >
        <FormStatus state={approveState} />
        <input type="hidden" name="dealId" value={dealId} />
        <p className="text-sm">{t('approveHint')}</p>
        <SubmitButton className="w-fit">{t('approve')}</SubmitButton>
      </form>
      {canRequestChanges ? (
        <form
          action={changes.formAction}
          onSubmit={changes.onSubmit}
          noValidate
          className="grid content-start gap-2"
        >
          <FormStatus state={changes.state} />
          <input type="hidden" name="dealId" value={dealId} />
          <TextareaField
            name="note"
            label={t('changesNote')}
            hint={t('roundsLeft', { count: changeRequestsLeft })}
            rows={3}
            maxLength={DEAL_LIMITS.reasonMax}
            error={changes.fieldErrors.note}
          />
          <SubmitButton variant="outline" className="w-fit">
            {t('requestChanges')}
          </SubmitButton>
        </form>
      ) : (
        <p className="text-muted-foreground text-sm">{t('noRoundsLeft')}</p>
      )}
    </div>
  );
}

/** ADR-012: either side sends a disagreement about the work to the admins. */
export function DisputeForm({ dealId }: { dealId: string }) {
  const t = useTranslations('deals.work');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    reviewNoteSchema,
    raiseDisputeAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-3">
      <FormStatus state={state} successMessage={t('disputeSent')} />
      <input type="hidden" name="dealId" value={dealId} />
      <TextareaField
        name="note"
        label={t('disputeNote')}
        hint={t('disputeHint')}
        rows={2}
        maxLength={DEAL_LIMITS.reasonMax}
        error={fieldErrors.note}
      />
      <SubmitButton variant="outline" className="w-fit">
        {t('dispute')}
      </SubmitButton>
    </form>
  );
}

/** FR-9.3 / FR-9.5: the published post's link, with the disclosure reminder. */
export function PostLinkForm({ dealId }: { dealId: string }) {
  const t = useTranslations('deals.actions');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    postLinkSchema,
    addPostLinkAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-3">
      <FormStatus state={state} successMessage={t('postAdded')} />
      <input type="hidden" name="dealId" value={dealId} />
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('disclosure')}</p>
      <FormField
        name="url"
        type="url"
        label={t('postUrl')}
        hint={t('postUrlHint')}
        maxLength={DEAL_LIMITS.postUrlMax}
        error={fieldErrors.url}
      />
      <SubmitButton className="w-fit">{t('addPost')}</SubmitButton>
    </form>
  );
}

/** UC-R5: the brand marks the deal paid. */
export function MarkPaidForm({ dealId }: { dealId: string }) {
  const t = useTranslations('deals.actions');
  const [state, formAction] = useActionState(markDealPaidAction, IDLE);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(t('markPaidConfirm'))) event.preventDefault();
      }}
      className="grid gap-2"
    >
      <FormStatus state={state} />
      <input type="hidden" name="dealId" value={dealId} />
      <p className="text-sm">{t('markPaidHint')}</p>
      <SubmitButton className="w-fit">{t('markPaid')}</SubmitButton>
    </form>
  );
}

/** UC-R5: the creator confirms the payment, or says it didn't arrive. */
export function ConfirmPaymentForms({ dealId }: { dealId: string }) {
  const t = useTranslations('deals.actions');
  const [confirmState, confirmAction] = useActionState(confirmPaymentAction, IDLE);
  const dispute = useValidatedForm(paymentDisputeSchema, reportPaymentAction);
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <form action={confirmAction} className="grid content-start gap-2">
        <FormStatus state={confirmState} />
        <input type="hidden" name="dealId" value={dealId} />
        <p className="text-sm">{t('confirmHint')}</p>
        <SubmitButton className="w-fit">{t('confirmReceived')}</SubmitButton>
      </form>
      <form
        action={dispute.formAction}
        onSubmit={dispute.onSubmit}
        noValidate
        className="grid content-start gap-2"
      >
        <FormStatus state={dispute.state} successMessage={t('disputeSent')} />
        <input type="hidden" name="dealId" value={dealId} />
        <TextareaField
          name="note"
          label={t('notReceivedNote')}
          rows={2}
          maxLength={DEAL_LIMITS.reasonMax}
          error={dispute.fieldErrors.note}
        />
        <SubmitButton variant="outline" className="w-fit">
          {t('notReceived')}
        </SubmitButton>
      </form>
    </div>
  );
}

/** UC-R4: cancel with a reason the other side sees. */
export function CancelDealForm({ dealId }: { dealId: string }) {
  const t = useTranslations('deals.actions');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    cancelDealSchema,
    cancelDealAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-3">
      <FormStatus state={state} />
      <input type="hidden" name="dealId" value={dealId} />
      <TextareaField
        name="reason"
        label={t('cancelReason')}
        rows={2}
        maxLength={DEAL_LIMITS.reasonMax}
        error={fieldErrors.reason}
      />
      <SubmitButton variant="destructive" className="w-fit">
        {t('cancel')}
      </SubmitButton>
    </form>
  );
}

/** FR-9.4: prints the summary page (or saves it as PDF from the print dialog). */
export function PrintButton() {
  const t = useTranslations('deals.summary');
  return (
    <Button
      type="button"
      variant="outline"
      className="w-fit print:hidden"
      onClick={() => window.print()}
    >
      {t('print')}
    </Button>
  );
}
