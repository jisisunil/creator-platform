/** Security tunables for accounts and sessions (SR-1..SR-3, UC-A). */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** SR-1: minimum password length. */
export const PASSWORD_MIN_LENGTH = 10;
/** Upper bound so hashing cost stays predictable. */
export const PASSWORD_MAX_LENGTH = 128;

/** SR-2: sessions last 30 days and slide forward when used. */
export const SESSION_MAX_AGE_MS = 30 * DAY_MS;
/** Extend a session at most once per hour to avoid a write on every request. */
export const SESSION_REFRESH_INTERVAL_MS = HOUR_MS;

/** UC-A2 / SR-3: lock an account after 5 failed passwords, for 15 minutes. */
export const LOGIN_LOCKOUT_THRESHOLD = 5;
export const LOGIN_LOCKOUT_DURATION_MS = 15 * MINUTE_MS;
/** SR-3: require a CAPTCHA once an account or IP has this many recent failures. */
export const CAPTCHA_AFTER_FAILURES = 3;

export const EMAIL_VERIFICATION_TTL_MS = 2 * DAY_MS;
export const PASSWORD_RESET_TTL_MS = HOUR_MS;
export const EMAIL_CHANGE_TTL_MS = DAY_MS;
export const TEAM_INVITE_TTL_MS = 7 * DAY_MS;
/** UC-A1 / PR-9: accounts never verified are deleted after 7 days. */
export const UNVERIFIED_ACCOUNT_RETENTION_MS = 7 * DAY_MS;
/** A pending Google sign-up or account link must finish within 15 minutes. */
export const PENDING_OAUTH_TTL_MS = 15 * MINUTE_MS;
/** SR-4: an admin's TOTP check lasts as long as the session, but at most 12 hours. */
export const TWO_FACTOR_VALIDITY_MS = 12 * HOUR_MS;

export interface RateLimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

/** SR-3 / SR-11: per-IP and per-account limits. */
export const RATE_LIMITS = {
  signInPerIp: { limit: 20, windowMs: 15 * MINUTE_MS },
  signInPerAccount: { limit: 10, windowMs: 15 * MINUTE_MS },
  signUpPerIp: { limit: 5, windowMs: HOUR_MS },
  passwordResetPerIp: { limit: 5, windowMs: HOUR_MS },
  passwordResetPerAccount: { limit: 3, windowMs: HOUR_MS },
  verificationResendPerAccount: { limit: 3, windowMs: HOUR_MS },
  twoFactorPerAccount: { limit: 5, windowMs: 15 * MINUTE_MS },
  teamInvitePerBrand: { limit: 20, windowMs: DAY_MS },
  /** SR-11 / SEC-3: brand searches per user, and public profile views per IP (scraping). */
  searchPerUser: { limit: 300, windowMs: HOUR_MS },
  publicProfilePerIp: { limit: 120, windowMs: HOUR_MS },
  /** SR-11 / SEC-6: collaboration requests per user (the plan limit applies as well). */
  requestsPerUser: { limit: 50, windowMs: DAY_MS },
  /** SEC-6: chat messages (including attachments) and reports per user. */
  messagesPerUser: { limit: 60, windowMs: 10 * MINUTE_MS },
  reportsPerUser: { limit: 10, windowMs: DAY_MS },
  /** PR-5 / SR-14: data exports and correction requests per user. */
  dataRequestsPerUser: { limit: 5, windowMs: DAY_MS },
} as const satisfies Record<string, RateLimitRule>;
