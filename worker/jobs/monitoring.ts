import { getServerEnv } from '@/config/env';
import { JOB_NAMES } from '@/config/jobs';
import {
  checkDataRequestDeadlines,
  checkSocialDataHealth,
  runSecurityChecks,
} from '@/services/monitoring';
import type { JobDefinition } from '../job-definition';

const alertEmail = () => getServerEnv().ALERT_EMAIL ?? null;

/** SR-14: failed-login spikes, export volume and off-hours admin actions, every 15 minutes. */
export const runSecurityChecksJob: JobDefinition = {
  name: JOB_NAMES.runSecurityChecks,
  schedule: '*/15 * * * *',
  scheduleTimezone: 'Asia/Kolkata',
  handle: (_data, container) => runSecurityChecks({ ...container, alertEmail: alertEmail() }),
};

/** PR-5: daily check of data requests near or past their 30-day due date. */
export const checkDataRequestDeadlinesJob: JobDefinition = {
  name: JOB_NAMES.checkDataRequestDeadlines,
  schedule: '0 10 * * *',
  scheduleTimezone: 'Asia/Kolkata',
  handle: (_data, container) =>
    checkDataRequestDeadlines({ ...container, alertEmail: alertEmail() }),
};

/** NFR-3 / NFR-13: daily, after the 02:00 refresh run has had time to finish. */
export const checkSocialDataHealthJob: JobDefinition = {
  name: JOB_NAMES.checkSocialDataHealth,
  schedule: '0 9 * * *',
  scheduleTimezone: 'Asia/Kolkata',
  handle: (_data, container) => checkSocialDataHealth({ ...container, alertEmail: alertEmail() }),
};
