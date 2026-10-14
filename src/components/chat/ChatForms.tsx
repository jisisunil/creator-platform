'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { reportChatPartnerAction, sendMessageAction } from '@/app/[locale]/(app)/messages/actions';
import { FieldErrorText } from '@/components/forms/FormField';
import { FormStatus } from '@/components/forms/FormStatus';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { TextareaField } from '@/components/forms/TextareaField';
import { useValidatedForm } from '@/components/forms/use-validated-form';
import { Label } from '@/components/ui/label';
import { CHAT_LIMITS, REPORT_REASON_MAX } from '@/config/collaboration';
import { reportSchema, sendMessageSchema } from '@/lib/validation/chat-schemas';

/** FR-8.1: write a message, optionally with an image or PDF (10 MB at most). */
export function MessageComposer({ threadId }: { threadId: string }) {
  const t = useTranslations('chat');
  const tFields = useTranslations('fieldErrors');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    sendMessageSchema,
    sendMessageAction,
  );
  return (
    // React resets the form after each send, clearing the text and the file.
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-3">
      {state.status === 'error' && state.code === 'NOT_AVAILABLE' ? (
        <p role="alert" className="text-destructive text-sm">
          {t('cannotSend')}
        </p>
      ) : (
        <FormStatus state={state} />
      )}
      <input type="hidden" name="threadId" value={threadId} />
      <TextareaField
        name="body"
        label={t('message')}
        rows={3}
        maxLength={CHAT_LIMITS.messageMax}
        error={fieldErrors.body}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="field-attachment">{t('attach')}</Label>
        <input
          id="field-attachment"
          name="attachment"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          aria-describedby="field-attachment-hint"
          className="text-sm"
        />
        <p id="field-attachment-hint" className="text-muted-foreground text-xs">
          {t('attachHint')}
        </p>
        {fieldErrors.attachment ? (
          <FieldErrorText message={tFields(fieldErrors.attachment)} />
        ) : null}
      </div>
      <SubmitButton className="w-fit">{t('send')}</SubmitButton>
    </form>
  );
}

/** FR-8.3: report the other side to the moderators. */
export function ReportForm({
  threadId,
  otherPartyName,
}: {
  threadId: string;
  otherPartyName: string;
}) {
  const t = useTranslations('chat.report');
  const { state, formAction, onSubmit, fieldErrors } = useValidatedForm(
    reportSchema,
    reportChatPartnerAction,
  );
  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-3">
      <FormStatus state={state} successMessage={t('sent')} />
      <input type="hidden" name="threadId" value={threadId} />
      <TextareaField
        name="reason"
        label={t('reason', { name: otherPartyName })}
        hint={t('hint')}
        rows={3}
        maxLength={REPORT_REASON_MAX}
        error={fieldErrors.reason}
      />
      <SubmitButton variant="outline" size="sm" className="w-fit">
        {t('submit')}
      </SubmitButton>
    </form>
  );
}

/**
 * Re-renders the page every `intervalMs` while the tab is visible, so new messages show up
 * without a reload. Typed text is kept: only server-rendered parts update.
 */
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
