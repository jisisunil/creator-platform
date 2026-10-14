'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { type ActionState, IDLE } from '@/lib/action-state';
import { inviteMemberSchema } from '@/lib/validation/account-schemas';
import {
  inviteMemberAction,
  removeMemberAction,
  revokeInviteAction,
  transferOwnershipAction,
} from './actions';

/** UC-A6: invite form for the brand owner. */
export function InviteMemberForm() {
  const t = useTranslations('team');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    inviteMemberSchema,
    inviteMemberAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormStatus state={state} successMessage={t('invited')} />
      <FormField
        name="email"
        type="email"
        label={t('inviteEmail')}
        autoComplete="off"
        error={fieldErrors.email}
      />
      <SubmitButton>{t('inviteSubmit')}</SubmitButton>
    </form>
  );
}

function RowAction({
  id,
  label,
  confirmMessage,
  action,
}: {
  id: string;
  label: string;
  confirmMessage?: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
      className="grid gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="outline" size="sm">
        {label}
      </SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}

/** Remove one member (owner only; the server checks). */
export function RemoveMemberButton({ userId, name }: { userId: string; name: string }) {
  const t = useTranslations('team');
  return (
    <RowAction
      id={userId}
      label={t('remove')}
      confirmMessage={t('removeConfirm', { name })}
      action={removeMemberAction}
    />
  );
}

/** UC-A5: make a member the brand owner (owner only; the server checks). */
export function MakeOwnerButton({ userId, name }: { userId: string; name: string }) {
  const t = useTranslations('team');
  return (
    <RowAction
      id={userId}
      label={t('makeOwner')}
      confirmMessage={t('makeOwnerConfirm', { name })}
      action={transferOwnershipAction}
    />
  );
}

/** Cancel one pending invite (owner only; the server checks). */
export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const t = useTranslations('team');
  return <RowAction id={inviteId} label={t('revoke')} action={revokeInviteAction} />;
}
