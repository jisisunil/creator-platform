import * as Sentry from '@sentry/nextjs';
import { type DomainErrorCode, type FieldErrors, isDomainError } from '@/domain/errors';
import { getLogger } from './logger';

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
};

export type ErrorCode = DomainErrorCode | 'INTERNAL';

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
