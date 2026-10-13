'use client';

import { useTranslations } from 'next-intl';
import type * as React from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

/** A submit button that is disabled while its form is sending, preventing double submits. */
export function SubmitButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  const t = useTranslations('common');
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? t('saving') : children}
    </Button>
  );
}
