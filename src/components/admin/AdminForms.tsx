'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  addCreditPackAction,
  changePlanAction,
  extendTrialAction,
  setFreeBetaAction,
} from '@/app/[locale]/(app)/admin/actions';
import { FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { TextareaField } from '@/components/forms/TextareaField';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { CREDIT_PACKS } from '@/config/plans';
import { type ActionState, IDLE } from '@/lib/action-state';
import { PLAN_CODES, suspendUserSchema } from '@/lib/validation/admin-schemas';

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** A one-click admin action on a user, with an optional confirmation. */
export function UserActionButton({
  action,
  userId,
  label,
  confirmText,
  successMessage,
}: {
  action: Action;
  userId: string;
  label: string;
  confirmText?: string;
  successMessage?: string;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmText && !window.confirm(confirmText)) event.preventDefault();
      }}
      className="grid gap-2"
    >
      <input type="hidden" name="userId" value={userId} />
      <FormStatus state={state} successMessage={successMessage} />
      <SubmitButton variant="outline" size="sm" className="w-fit">
        {label}
      </SubmitButton>
    </form>
  );
}

/** UC-M1: suspend with a reason (audited). */
export function SuspendUserForm({ action, userId }: { action: Action; userId: string }) {
  const t = useTranslations('admin.users');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(suspendUserSchema, action);
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-2">
      <FormStatus state={state} />
      <input type="hidden" name="userId" value={userId} />
      <TextareaField name="reason" label={t('suspendReason')} rows={2} error={fieldErrors.reason} />
      <SubmitButton variant="destructive" size="sm" className="w-fit">
        {t('suspend')}
      </SubmitButton>
    </form>
  );
}

/** FR-11.3: move a brand to another plan. */
export function ChangePlanForm({
  brandId,
  userId,
  currentPlanCode,
}: {
  brandId: string;
  userId: string;
  currentPlanCode: string;
}) {
  const t = useTranslations('admin.plans');
  const tNames = useTranslations('plans.names');
  const [state, formAction] = useActionState(changePlanAction, IDLE);
  return (
    <form action={formAction} className="grid gap-2">
      <FormStatus state={state} successMessage={t('planChanged')} />
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="userId" value={userId} />
      <Label htmlFor="admin-plan">{t('plan')}</Label>
      <NativeSelect id="admin-plan" name="planCode" defaultValue={currentPlanCode}>
        {PLAN_CODES.map((code) => (
          <option key={code} value={code}>
            {tNames(code)}
          </option>
        ))}
      </NativeSelect>
      <SubmitButton variant="outline" size="sm" className="w-fit">
        {t('changePlan')}
      </SubmitButton>
    </form>
  );
}

/** FR-11.3: extend a trial by some days. */
export function ExtendTrialForm({ brandId, userId }: { brandId: string; userId: string }) {
  const t = useTranslations('admin.plans');
  const [state, formAction] = useActionState(extendTrialAction, IDLE);
  return (
    <form action={formAction} className="grid gap-2">
      <FormStatus state={state} successMessage={t('trialExtended')} />
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="userId" value={userId} />
      <FormField name="days" label={t('extendDays')} inputMode="numeric" defaultValue="7" />
      <SubmitButton variant="outline" size="sm" className="w-fit">
        {t('extendTrial')}
      </SubmitButton>
    </form>
  );
}

/** Pay-as-you-go: add a credit pack after payment. */
export function AddCreditPackForm({ brandId, userId }: { brandId: string; userId: string }) {
  const t = useTranslations('admin.plans');
  const [state, formAction] = useActionState(addCreditPackAction, IDLE);
  return (
    <form action={formAction} className="grid gap-2">
      <FormStatus state={state} successMessage={t('packAdded')} />
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="userId" value={userId} />
      <Label htmlFor="admin-pack">{t('pack')}</Label>
      <NativeSelect id="admin-pack" name="packCode">
        {CREDIT_PACKS.map((pack) => (
          <option key={pack.code} value={pack.code}>
            {t('packOption', { credits: pack.credits, days: pack.validDays })}
          </option>
        ))}
      </NativeSelect>
      <SubmitButton variant="outline" size="sm" className="w-fit">
        {t('addPack')}
      </SubmitButton>
    </form>
  );
}

/** UC-B1: new brands start on the free beta, or on a trial once it ends. */
export function FreeBetaForm({ isActive }: { isActive: boolean }) {
  const t = useTranslations('admin.overview');
  const [state, formAction] = useActionState(setFreeBetaAction, IDLE);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (isActive && !window.confirm(t('endBetaConfirm'))) event.preventDefault();
      }}
      className="grid gap-2"
    >
      <FormStatus state={state} />
      <p className="text-sm">{isActive ? t('betaOn') : t('betaOff')}</p>
      <input type="hidden" name="isActive" value={isActive ? 'false' : 'true'} />
      <SubmitButton variant="outline" size="sm" className="w-fit">
        {isActive ? t('endBeta') : t('startBeta')}
      </SubmitButton>
    </form>
  );
}
