/**
 * Expected business failures. Each has a stable `code`; the user-facing text lives in
 * i18n under `errors.<code>`. HTTP mapping happens in one place: src/lib/http-errors.ts.
 */
export type DomainErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_STATE'
  | 'RATE_LIMITED'
  | 'PLAN_LIMIT_REACHED'
  | 'REQUEST_EXPIRED'
  | 'NOT_AVAILABLE'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_SUSPENDED'
  | 'EMAIL_NOT_VERIFIED'
  | 'CAPTCHA_REQUIRED'
  | 'INVALID_LINK';

/** Field-level problems, safe to show to the user. Keys are field names, values i18n keys. */
export type FieldErrors = Readonly<Record<string, string>>;

export class DomainError extends Error {
  override readonly name = 'DomainError';

  constructor(
    readonly code: DomainErrorCode,
    readonly fieldErrors?: FieldErrors,
  ) {
    super(code);
  }
}

/** True when `error` is an expected business failure rather than a bug. */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/** Input failed server-side validation. */
export const validationFailed = (fieldErrors?: FieldErrors): DomainError =>
  new DomainError('VALIDATION_FAILED', fieldErrors);

/** No signed-in user. */
export const unauthenticated = (): DomainError => new DomainError('UNAUTHENTICATED');

/** Signed in, but this role or account may not do this. */
export const notAllowed = (): DomainError => new DomainError('NOT_ALLOWED');

/** Missing, or owned by someone else (never reveal which: SEC-2). */
export const notFound = (): DomainError => new DomainError('NOT_FOUND');

/** Conflicts with existing data (e.g. duplicate). */
export const conflict = (): DomainError => new DomainError('CONFLICT');

/** The record is not in a state that allows this action. */
export const invalidState = (): DomainError => new DomainError('INVALID_STATE');

/** Too many attempts in the current window. */
export const rateLimited = (): DomainError => new DomainError('RATE_LIMITED');

/** The brand's plan does not allow more of this action (FR-11.2). */
export const planLimitReached = (): DomainError => new DomainError('PLAN_LIMIT_REACHED');

/** The collaboration request is past its expiry date (FR-7.2). */
export const requestExpired = (): DomainError => new DomainError('REQUEST_EXPIRED');

/**
 * The other side can't be contacted right now. Deliberately the same for "not open to
 * collaborations", "blocked" and "account gone", so a block is never revealed (UC-R1).
 */
export const notAvailable = (): DomainError => new DomainError('NOT_AVAILABLE');

/**
 * Sign-in failed. Deliberately the same for an unknown email, a wrong password and a
 * locked account, so attackers can't tell which (SR-3, UC-A2).
 */
export const invalidCredentials = (): DomainError => new DomainError('INVALID_CREDENTIALS');

/** The account is suspended. Only revealed after a correct password. */
export const accountSuspended = (): DomainError => new DomainError('ACCOUNT_SUSPENDED');

/** The email address hasn't been verified yet (FR-1.1). */
export const emailNotVerified = (): DomainError => new DomainError('EMAIL_NOT_VERIFIED');

/** A CAPTCHA must be solved before trying again (SR-3). */
export const captchaRequired = (): DomainError => new DomainError('CAPTCHA_REQUIRED');

/** An emailed link is unknown, expired or already used (UC-A3). */
export const invalidLink = (): DomainError => new DomainError('INVALID_LINK');
