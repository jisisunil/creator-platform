'use client';

import { useTranslations } from 'next-intl';
import type * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FormFieldProps extends Omit<React.ComponentProps<'input'>, 'name' | 'id'> {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  /** i18n key under `fieldErrors`. */
  readonly error?: string;
}

/** Labelled input with hint and error text wired up for screen readers (NFR-9). */
export function FormField({ name, label, hint, error, ...inputProps }: FormFieldProps) {
  const t = useTranslations('fieldErrors');
  const id = `field-${name}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        {...inputProps}
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

export function FieldErrorText({ id, message }: { id?: string; message: string }) {
  return (
    <p id={id} className="text-destructive text-sm">
      {message}
    </p>
  );
}
