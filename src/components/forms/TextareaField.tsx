'use client';

import { useTranslations } from 'next-intl';
import type * as React from 'react';
import { Label } from '@/components/ui/label';
import { FieldErrorText } from './FormField';

interface TextareaFieldProps extends Omit<React.ComponentProps<'textarea'>, 'name' | 'id'> {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  /** i18n key under `fieldErrors`. */
  readonly error?: string;
}

/** Labelled multi-line input with hint and error text wired up for screen readers (NFR-9). */
export function TextareaField({ name, label, hint, error, ...props }: TextareaFieldProps) {
  const t = useTranslations('fieldErrors');
  const id = `field-${name}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive rounded-md border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-[3px] md:text-sm"
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      {error ? <FieldErrorText id={errorId} message={t(error)} /> : null}
    </div>
  );
}
