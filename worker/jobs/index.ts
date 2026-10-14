import type { JobDefinition } from '../job-definition';
import { refreshDealPostsJob, sendDealRemindersJob } from './deals';
import { dispatchEmailsJob } from './dispatch-emails';
import { heartbeatJob } from './heartbeat';
import { sendTrialRemindersJob } from './plans';
import { checkDataRequestDeadlinesJob, runSecurityChecksJob } from './monitoring';
import { finaliseDeletionsJob, handleInactiveAccountsJob } from './privacy';
import { expireRequestsJob } from './requests';
import {
  purgeExpiredSecurityDataJob,
  purgeUnverifiedAccountsJob,
  reduceOldSnapshotsJob,
} from './retention';
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
  sendDealRemindersJob,
  refreshDealPostsJob,
  sendTrialRemindersJob,
  finaliseDeletionsJob,
  handleInactiveAccountsJob,
  reduceOldSnapshotsJob,
  runSecurityChecksJob,
  checkDataRequestDeadlinesJob,
];
