/** Background job (queue) names shared by the web app, which enqueues, and the worker. */
export const JOB_NAMES = {
  heartbeat: 'system.heartbeat',
  dispatchEmails: 'email.dispatch',
  purgeUnverifiedAccounts: 'accounts.purge-unverified',
  purgeExpiredSecurityData: 'security.purge-expired',
  queueDueRefreshes: 'social.queue-due-refreshes',
  refreshSocialAccount: 'social.refresh-account',
  expireRequests: 'requests.expire',
  sendDealReminders: 'deals.send-reminders',
  refreshDealPosts: 'deals.refresh-posts',
  sendTrialReminders: 'plans.trial-reminders',
  finaliseDeletions: 'privacy.finalise-deletions',
  handleInactiveAccounts: 'privacy.inactive-accounts',
  reduceOldSnapshots: 'retention.reduce-snapshots',
  runSecurityChecks: 'monitoring.security-checks',
  checkDataRequestDeadlines: 'monitoring.data-request-deadlines',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
