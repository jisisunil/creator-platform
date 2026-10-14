import type { JobDefinition } from '../job-definition';
import { dispatchEmailsJob } from './dispatch-emails';
import { heartbeatJob } from './heartbeat';
import { expireRequestsJob } from './requests';
import { purgeExpiredSecurityDataJob, purgeUnverifiedAccountsJob } from './retention';
import { queueDueRefreshesJob, refreshSocialAccountJob } from './social-refresh';

/** Every job the worker runs. Add new jobs here. */
export const ALL_JOBS: readonly JobDefinition[] = [
  heartbeatJob,
  dispatchEmailsJob,
  purgeUnverifiedAccountsJob,
  purgeExpiredSecurityDataJob,
  queueDueRefreshesJob,
  refreshSocialAccountJob,
  expireRequestsJob,
];
