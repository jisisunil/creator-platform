'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  addPostLinkAction,
  cancelDealAction,
  confirmPaymentAction,
  markDealPaidAction,
  reportPaymentAction,
  submitContentAction,
  updateDealTermsAction,
} from '@/app/[locale]/(app)/deals/actions';
import { FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { TextareaField } from '@/components/forms/TextareaField';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { Button } from '@/components/ui/button';
import { DEAL_LIMITS } from '@/config/collaboration';
import { IDLE } from '@/lib/action-state';
import {
  cancelDealSchema,
  contentNoteSchema,
  dealTermsSchema,
  paymentDisputeSchema,
  postLinkSchema,
} from '@/lib/validation/deal-schemas';

/** FR-9.2: agreed amount, advance and due date (brand). */
export function DealTermsForm({
  dealId,
  agreedAmountRupees,
  advancePercent,
  paymentDueOn,
}: {
  dealId: string;
  agreedAmountRupees: number | null;
  advancePercent: number | null;
  paymentDueOn: string | null;
}) {
  const t = useTranslations('deals.terms');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    dealTermsSchema,
    updateDealTermsAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} successMessage={t('saved')} />
      <input type="hidden" name="dealId" value={dealId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          name="agreedAmountRupees"
          label={t('amount')}
          inputMode="numeric"
          defaultValue={agreedAmountRupees ?? ''}
          error={fieldErrors.agreedAmountRupees}
        />
        <FormField
          name="advancePercent"
          label={t('advancePercent')}
          inputMode="numeric"
          defaultValue={advancePercent ?? ''}
          error={fieldErrors.advancePercent}
        />
        <FormField
          name="paymentDueOn"
          type="date"
          label={t('dueOn')}
          defaultValue={paymentDueOn ?? ''}
          error={fieldErrors.paymentDueOn}
        />
      </div>
      <SubmitButton variant="outline" className="w-fit">
        {t('save')}
      </SubmitButton>
    </form>
  );
}

/** FR-9.1: the creator sends the content for review. */
export function SubmitContentForm({ dealId }: { dealId: string }) {
  const t = useTranslations('deals.actions');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    contentNoteSchema,
    submitContentAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-3">
      <FormStatus state={state} />
      <input type="hidden" name="dealId" value={dealId} />
      <TextareaField
        name="note"
        label={t('contentNote')}
        hint={t('contentNoteHint')}
        rows={2}
        maxLength={DEAL_LIMITS.reasonMax}
        error={fieldErrors.note}
      />
      <SubmitButton className="w-fit">{t('submitContent')}</SubmitButton>
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
