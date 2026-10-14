'use client';

import { useActionState } from 'react';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { TextareaField } from '@/components/forms/TextareaField';
import type { Button } from '@/components/ui/button';
import { type ActionState, IDLE } from '@/lib/action-state';

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;
type Variant = React.ComponentProps<typeof Button>['variant'];

/**
 * An admin decision that needs a written note or reason (kept in the audit log, SEC-11).
 * `hidden` carries the ids and the chosen decision.
 */
export function ReasonForm({
  action,
  hidden,
  fieldName,
  label,
  submitLabel,
  variant = 'outline',
  successMessage,
}: {
  action: Action;
  hidden: Readonly<Record<string, string>>;
  fieldName: string;
  label: string;
  submitLabel: string;
  variant?: Variant;
  successMessage?: string;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  const error = state.status === 'error' ? state.fieldErrors?.[fieldName] : undefined;
  return (
    <form action={formAction} className="grid gap-2">
      <FormStatus state={state} successMessage={successMessage} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <TextareaField name={fieldName} label={label} rows={2} error={error} />
      <SubmitButton variant={variant} size="sm" className="w-fit">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

/** A one-click admin decision (e.g. clear a flag, hide a rating). */
export function DecisionButton({
  action,
  hidden,
  label,
  variant = 'outline',
}: {
  action: Action;
  hidden: Readonly<Record<string, string>>;
  label: string;
  variant?: Variant;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  return (
    <form action={formAction} className="grid gap-1">
      <FormStatus state={state} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton variant={variant} size="sm" className="w-fit">
        {label}
      </SubmitButton>
    </form>
  );
}
