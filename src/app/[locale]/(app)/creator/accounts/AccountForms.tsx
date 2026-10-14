'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormField } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { IDLE } from '@/lib/action-state';
import { channelLinkSchema } from '@/lib/validation/creator-schemas';
import { chooseAccountAction, disconnectAccountAction, linkChannelAction } from '../actions';

/** FR-3.1: link a YouTube channel by URL (unverified until Google sign-in). */
export function LinkChannelForm() {
  const t = useTranslations('creator.accounts');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    channelLinkSchema,
    linkChannelAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-3">
      <FormStatus state={state} />
      <FormField
        name="channelUrlOrId"
        label={t('channelUrl')}
        hint={t('linkHint')}
        placeholder="youtube.com/@yourname"
        error={fieldErrors.channelUrlOrId}
      />
      <SubmitButton variant="outline">{t('link')}</SubmitButton>
    </form>
  );
}

/** UC-C5 / PRV-7: disconnect, after confirming that data will be deleted. */
export function DisconnectButton({ accountId }: { accountId: string }) {
  const t = useTranslations('creator.accounts');
  const [state, formAction] = useActionState(disconnectAccountAction, IDLE);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(t('disconnectConfirm'))) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={accountId} />
      <SubmitButton variant="outline" size="sm">
        {t('disconnect')}
      </SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}

/** UC-C2: pick one channel from a multi-channel Google login. */
export function ChooseAccountButton({
  pendingId,
  externalId,
}: {
  pendingId: string;
  externalId: string;
}) {
  const t = useTranslations('creator.accounts');
  const [state, formAction] = useActionState(chooseAccountAction, IDLE);
  return (
    <form action={formAction}>
      <input type="hidden" name="pendingId" value={pendingId} />
      <input type="hidden" name="externalId" value={externalId} />
      <SubmitButton size="sm">{t('choose')}</SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}
