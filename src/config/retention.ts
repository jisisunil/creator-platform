/** How long security and operational data is kept (SR-13, PR-9, data inventory). */

const DAY_MS = 86_400_000;

/** SR-13: security and audit logs are kept at least one year. */
export const AUDIT_LOG_RETENTION_MS = 365 * DAY_MS;
/** Sent or failed emails are kept briefly for support, without their payload. */
export const EMAIL_OUTBOX_RETENTION_MS = 30 * DAY_MS;
/** Rate-limit windows are useless after they close; keep a day for investigations. */
export const RATE_LIMIT_RETENTION_MS = DAY_MS;
/** PR-9: in-app notifications are deleted after 180 days, read or not. */
export const NOTIFICATION_RETENTION_MS = 180 * DAY_MS;
/** PRV-4 / PR-5: a deletion is finalised, and admin-handled requests are due, after 30 days. */
export const DATA_REQUEST_DUE_MS = 30 * DAY_MS;
