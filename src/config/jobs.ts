/** Background job (queue) names shared by the web app, which enqueues, and the worker. */
export const JOB_NAMES = {
  heartbeat: 'system.heartbeat',
  dispatchEmails: 'email.dispatch',
  purgeUnverifiedAccounts: 'accounts.purge-unverified',
  purgeExpiredSecurityData: 'security.purge-expired',
  queueDueRefreshes: 'social.queue-due-refreshes',
  refreshSocialAccount: 'social.refresh-account',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
