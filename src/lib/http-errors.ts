import * as Sentry from '@sentry/nextjs';
import { type DomainErrorCode, type FieldErrors, isDomainError } from '@/domain/errors';
import type { ErrorCode } from './http-errors-codes';
import { getLogger } from './logger';

export type { ErrorCode };

const STATUS_BY_CODE: Readonly<Record<DomainErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  NOT_ALLOWED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE: 409,
  RATE_LIMITED: 429,
  PLAN_LIMIT_REACHED: 402,
  REQUEST_EXPIRED: 410,
  NOT_AVAILABLE: 409,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_SUSPENDED: 403,
  EMAIL_NOT_VERIFIED: 403,
  CAPTCHA_REQUIRED: 400,
  INVALID_LINK: 410,
};

export interface ErrorBody {
  readonly error: { readonly code: ErrorCode; readonly fieldErrors?: FieldErrors };
}

export interface MappedError {
  readonly status: number;
  readonly body: ErrorBody;
}

const logger = getLogger('http-errors');

/**
 * The single place where errors become HTTP responses. Domain errors keep their code;
 * anything else is a bug: logged, reported to Sentry, and returned as a generic 500.
 */
export function mapErrorToResponse(error: unknown): MappedError {
  if (isDomainError(error)) {
    return {
      status: STATUS_BY_CODE[error.code],
      body: { error: { code: error.code, fieldErrors: error.fieldErrors } },
    };
  }
  logger.error({ err: error }, 'unexpected error');
  Sentry.captureException(error);
  return { status: 500, body: { error: { code: 'INTERNAL' } } };
}
