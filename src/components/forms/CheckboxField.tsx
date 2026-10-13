'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { FieldErrorText } from './FormField';

interface CheckboxFieldProps {
  readonly name: string;
  readonly label: ReactNode;
  /** i18n key under `fieldErrors`. */
  readonly error?: string;
  readonly defaultChecked?: boolean;
}

/** A native checkbox; unticked by default, as consent requires (PR-2). */
export function CheckboxField({ name, label, error, defaultChecked = false }: CheckboxFieldProps) {
  const t = useTranslations('fieldErrors');
  const id = `field-${name}`;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="grid gap-1">
      <div className="flex items-start gap-2">
        <input
          id={id}
          name={name}
          type="checkbox"
          defaultChecked={defaultChecked}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="accent-primary mt-0.5 size-4 shrink-0"
        />
        <label htmlFor={id} className="text-sm">
          {label}
        </label>
      </div>
      {error ? <FieldErrorText id={errorId} message={t(error)} /> : null}
    </div>
  );
}
