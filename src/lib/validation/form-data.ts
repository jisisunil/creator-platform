import type { z } from 'zod';
import { type FieldErrors, validationFailed } from '@/domain/errors';

/** FormData as a plain object of strings (files and Next.js internals are dropped). */
export function formDataToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string' && !key.startsWith('$ACTION')) result[key] = value;
  }
  return result;
}

/** First message per top-level field. Messages are i18n keys under `fieldErrors`. */
export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return errors;
}

/** Validates form input on the server with the same schema the form uses in the browser. */
export function parseForm<Schema extends z.ZodType>(
  schema: Schema,
  formData: FormData,
): z.infer<Schema> {
  const result = schema.safeParse(formDataToObject(formData));
  if (!result.success) throw validationFailed(fieldErrorsFrom(result.error));
  return result.data;
}
