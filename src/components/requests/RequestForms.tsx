'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  sendRequestAction,
  updateRequestAction,
  withdrawRequestAction,
} from '@/app/[locale]/(app)/brand/requests/actions';
import { respondToRequestAction } from '@/app/[locale]/(app)/creator/requests/actions';
import { FieldErrorText, FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { TextareaField } from '@/components/forms/TextareaField';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { REQUEST_LIMITS } from '@/config/collaboration';
import type { FieldErrors } from '@/domain/errors';
import {
  DELIVERABLES,
  type DeliverableLine,
  USAGE_RIGHTS,
  type UsageRights,
} from '@/domain/requests';
import { type ActionState, IDLE } from '@/lib/action-state';
import { editRequestSchema, sendRequestSchema } from '@/lib/validation/request-schemas';

export interface RequestDraft {
  readonly campaignName: string;
  readonly brief: string;
  readonly deliverables: readonly DeliverableLine[];
  readonly budgetRupees: number | null;
  /** "YYYY-MM-DD". */
  readonly deadline: string;
  readonly usageRights: UsageRights;
}

const CAMPAIGN_LIST_ID = 'campaign-names';

/** The fields shared by "send" and "edit" (FR-7.1). */
function RequestFields({
  draft,
  campaignNames,
  minDeadline,
  fieldErrors,
}: {
  draft?: RequestDraft;
  campaignNames: readonly string[];
  minDeadline: string;
  fieldErrors: FieldErrors;
}) {
  const t = useTranslations('requests.form');
  const tDeliverables = useTranslations('deliverables');
  const tRights = useTranslations('requests.usageRights');
  const tFields = useTranslations('fieldErrors');
  const quantityOf = (type: string) =>
    draft?.deliverables.find((line) => line.deliverable === type)?.quantity ?? '';
  const deliverablesError =
    fieldErrors.deliverables ?? DELIVERABLES.map((type) => fieldErrors[type]).find(Boolean);
  return (
    <>
      <FormField
        name="campaignName"
        label={t('campaignName')}
        hint={t('campaignNameHint')}
        list={CAMPAIGN_LIST_ID}
        maxLength={REQUEST_LIMITS.campaignNameMax}
        defaultValue={draft?.campaignName}
        error={fieldErrors.campaignName}
      />
      <datalist id={CAMPAIGN_LIST_ID}>
        {campaignNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <TextareaField
        name="brief"
        label={t('brief')}
        hint={t('briefHint')}
        rows={6}
        maxLength={REQUEST_LIMITS.briefMax}
        defaultValue={draft?.brief}
        error={fieldErrors.brief}
      />
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{t('deliverables')}</legend>
        <p className="text-muted-foreground text-xs">{t('deliverablesHint')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DELIVERABLES.map((type) => (
            <div key={type} className="grid gap-1">
              <Label htmlFor={`field-${type}`}>{tDeliverables(type)}</Label>
              <Input
                id={`field-${type}`}
                name={type}
                inputMode="numeric"
                pattern="[0-9]*"
                defaultValue={quantityOf(type)}
                aria-invalid={fieldErrors[type] ? true : undefined}
              />
            </div>
          ))}
        </div>
        {deliverablesError ? <FieldErrorText message={tFields(deliverablesError)} /> : null}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="budgetRupees"
          label={t('budget')}
          hint={t('budgetHint')}
          inputMode="numeric"
          defaultValue={draft?.budgetRupees ?? ''}
          error={fieldErrors.budgetRupees}
        />
        <FormField
          name="deadline"
          type="date"
          label={t('deadline')}
          min={minDeadline}
          defaultValue={draft?.deadline}
          error={fieldErrors.deadline}
        />
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{t('usageRights')}</legend>
        {USAGE_RIGHTS.map((rights) => (
          <label key={rights} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="usageRights"
              value={rights}
              defaultChecked={(draft?.usageRights ?? 'CREATOR_CHANNELS_ONLY') === rights}
              className="accent-primary mt-0.5 size-4"
            />
            <span>{tRights(rights)}</span>
          </label>
        ))}
        {fieldErrors.usageRights ? (
          <FieldErrorText message={tFields(fieldErrors.usageRights)} />
        ) : null}
      </fieldset>
    </>
  );
}

/** Plan limit and duplicate requests get their own explanation (UC-R1). */
function RequestFormStatus({
  state,
  successMessage,
}: {
  state: ActionState;
  successMessage?: string;
}) {
  const t = useTranslations('requests.form');
  if (state.status === 'error' && state.code === 'PLAN_LIMIT_REACHED') {
    return <Alert variant="destructive">{t('limitReached')}</Alert>;
  }
  if (state.status === 'error' && state.code === 'CONFLICT') {
    return <Alert variant="destructive">{t('duplicate')}</Alert>;
  }
  return <FormStatus state={state} successMessage={successMessage} />;
}

/** FR-7.1 / UC-R1: a brand's new request to a creator. */
export function SendRequestForm({
  creatorId,
  campaignNames,
  minDeadline,
}: {
  creatorId: string;
  campaignNames: readonly string[];
  minDeadline: string;
}) {
  const t = useTranslations('requests.form');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    sendRequestSchema,
    sendRequestAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <RequestFormStatus state={state} />
      <input type="hidden" name="creatorId" value={creatorId} />
      <RequestFields
        campaignNames={campaignNames}
        minDeadline={minDeadline}
        fieldErrors={fieldErrors}
      />
      <SubmitButton>{t('send')}</SubmitButton>
    </form>
  );
}

/** UC-R2: the brand edits an open request; the creator sees the new version. */
export function EditRequestForm({
  requestId,
  draft,
  campaignNames,
  minDeadline,
}: {
  requestId: string;
  draft: RequestDraft;
  campaignNames: readonly string[];
  minDeadline: string;
}) {
  const t = useTranslations('requests.form');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    editRequestSchema,
    updateRequestAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <RequestFormStatus state={state} successMessage={t('updated')} />
      <input type="hidden" name="requestId" value={requestId} />
      <RequestFields
        draft={draft}
        campaignNames={campaignNames}
        minDeadline={minDeadline}
        fieldErrors={fieldErrors}
      />
      <SubmitButton variant="outline">{t('saveChanges')}</SubmitButton>
    </form>
  );
}

/** FR-7.2: withdraw an open request. */
export function WithdrawRequestButton({ requestId }: { requestId: string }) {
  const t = useTranslations('requests.detail');
  const [state, formAction] = useActionState(withdrawRequestAction, IDLE);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(t('withdrawConfirm'))) event.preventDefault();
      }}
      className="grid gap-2"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <FormStatus state={state} />
      <SubmitButton variant="outline">{t('withdraw')}</SubmitButton>
    </form>
  );
}

/** FR-7.2 / UC-R2: accept, or decline with an optional reason, the version shown. */
export function RespondToRequestForms({
  requestId,
  version,
}: {
  requestId: string;
  version: number;
}) {
  const t = useTranslations('requests.detail');
  const [acceptState, acceptAction] = useActionState(respondToRequestAction, IDLE);
  const [declineState, declineAction] = useActionState(respondToRequestAction, IDLE);
  const statusFor = (state: ActionState) =>
    state.status === 'error' && state.code === 'CONFLICT' ? (
      <Alert variant="destructive">{t('changedMeanwhile')}</Alert>
    ) : (
      <FormStatus state={state} />
    );
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <form action={acceptAction} className="grid content-start gap-3">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="decision" value="accept" />
        {statusFor(acceptState)}
        <p className="text-sm">{t('acceptHint')}</p>
        <SubmitButton>{t('accept')}</SubmitButton>
      </form>
      <form action={declineAction} className="grid content-start gap-3">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="decision" value="decline" />
        {statusFor(declineState)}
        <TextareaField
          name="reason"
          label={t('declineReason')}
          rows={2}
          maxLength={REQUEST_LIMITS.declineReasonMax}
        />
        <SubmitButton variant="outline">{t('decline')}</SubmitButton>
      </form>
    </div>
  );
}

/** FR-8.3: block or unblock the other side of a request. */
export function BlockToggleForm({
  action,
  requestId,
  isBlocked,
  otherPartyName,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  requestId: string;
  isBlocked: boolean;
  otherPartyName: string;
}) {
  const t = useTranslations('requests.block');
  const [state, formAction] = useActionState(action, IDLE);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!isBlocked && !window.confirm(t('confirm', { name: otherPartyName }))) {
          event.preventDefault();
        }
      }}
      className="grid gap-2"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="isBlocked" value={isBlocked ? 'false' : 'true'} />
      <FormStatus state={state} />
      <p className="text-muted-foreground text-xs">{isBlocked ? t('blockedNote') : t('hint')}</p>
      <SubmitButton variant={isBlocked ? 'outline' : 'ghost'} size="sm">
        {isBlocked ? t('unblock', { name: otherPartyName }) : t('block', { name: otherPartyName })}
      </SubmitButton>
    </form>
  );
}
