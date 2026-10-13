import type { FieldErrors } from '@/domain/errors';
import type { ErrorCode } from './http-errors-codes';

/** What a form's server action reports back to the form (via useActionState). */
export type ActionState =
  | { readonly status: 'idle' }
  | { readonly status: 'success' }
  | {
      readonly status: 'error';
      readonly code: ErrorCode;
      readonly fieldErrors?: FieldErrors;
    };

export const IDLE: ActionState = { status: 'idle' };
export const SUCCESS: ActionState = { status: 'success' };
