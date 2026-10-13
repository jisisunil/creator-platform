'use client';

import { type FormEvent, useActionState, useState } from 'react';
import type { z } from 'zod';
import type { FieldErrors } from '@/domain/errors';
import { type ActionState, IDLE } from '@/lib/action-state';
import { fieldErrorsFrom, formDataToObject } from '@/lib/validation/form-data';

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Connects a form to its server action and validates in the browser first with the same
 * Zod schema, so most mistakes show instantly (CLAUDE.md §10). The server still validates.
 * Submit buttons marked `formNoValidate` skip the browser check (e.g. "Continue with Google").
 */
export function useValidatedForm(schema: z.ZodType, action: FormAction) {
  const [state, formAction, isPending] = useActionState(action, IDLE);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter?.hasAttribute('formnovalidate')) {
      setClientErrors({});
      return;
    }
    const result = schema.safeParse(formDataToObject(new FormData(event.currentTarget)));
    if (result.success) {
      setClientErrors({});
    } else {
      event.preventDefault();
      setClientErrors(fieldErrorsFrom(result.error));
    }
  };

  const serverErrors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const fieldErrors = Object.keys(clientErrors).length > 0 ? clientErrors : serverErrors;
  return { state, formAction, isPending, onSubmit, fieldErrors };
}
