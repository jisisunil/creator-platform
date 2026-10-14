'use client';

import { useTranslations } from 'next-intl';
import { PlanLimitAlert } from '@/components/plans/PlanLimitAlert';
import { Alert } from '@/components/ui/alert';
import type { ActionState } from '@/lib/action-state';

/** Form-level outcome: the error message for the error code, or a success message. */
export function FormStatus({
  state,
  successMessage,
}: {
  state: ActionState;
  successMessage?: string;
}) {
  const t = useTranslations('errors');
  if (state.status === 'error' && state.code === 'PLAN_LIMIT_REACHED') {
    return <PlanLimitAlert reasonKey={state.fieldErrors?.plan} />;
  }
  if (state.status === 'error') {
    return <Alert variant="destructive">{t(state.code)}</Alert>;
  }
  if (state.status === 'success' && successMessage) {
    return <Alert variant="success">{successMessage}</Alert>;
  }
  return null;
}
