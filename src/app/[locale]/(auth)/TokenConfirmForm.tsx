'use client';

import { useActionState } from 'react';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { type ActionState, IDLE } from '@/lib/action-state';

interface TokenConfirmFormProps {
  readonly token: string;
  readonly action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  readonly submitLabel: string;
  readonly successMessage: string;
  readonly continueHref: string;
  readonly continueLabel: string;
}

/**
 * Confirms an emailed link with a button press. Links are never used up on page load,
 * because email security scanners open links automatically (ADR-003).
 */
export function TokenConfirmForm(props: TokenConfirmFormProps) {
  const [state, formAction] = useActionState(props.action, IDLE);
  if (state.status === 'success') {
    return (
      <div className="grid gap-4">
        <FormStatus state={state} successMessage={props.successMessage} />
        <Button asChild>
          <Link href={props.continueHref}>{props.continueLabel}</Link>
        </Button>
      </div>
    );
  }
  return (
    <form action={formAction} className="grid gap-4">
      <FormStatus state={state} />
      <input type="hidden" name="token" value={props.token} />
      <SubmitButton>{props.submitLabel}</SubmitButton>
    </form>
  );
}
