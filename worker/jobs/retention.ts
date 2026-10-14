import { JOB_NAMES } from '@/config/jobs';
import {
  purgeExpiredSecurityData,
  purgeUnverifiedAccounts,
  reduceOldSnapshots,
} from '@/services/retention';
import type { JobDefinition } from '../job-definition';

/** UC-A1 / PR-9: daily deletion of accounts never verified within 7 days. */
export const purgeUnverifiedAccountsJob: JobDefinition = {
  name: JOB_NAMES.purgeUnverifiedAccounts,
  schedule: '15 3 * * *',
  scheduleTimezone: 'Asia/Kolkata',
  handle: (_data, container) => purgeUnverifiedAccounts(container),
};

/** SR-13 / PR-9: daily clean-up of expired sessions, links, counters and old logs. */
export const purgeExpiredSecurityDataJob: JobDefinition = {
  name: JOB_NAMES.purgeExpiredSecurityData,
  schedule: '30 3 * * *',
  scheduleTimezone: 'Asia/Kolkata',
  handle: (_data, container) => purgeExpiredSecurityData(container),
};

/** Data inventory: weekly, stats older than 2 years are reduced to one per month. */
export const reduceOldSnapshotsJob: JobDefinition = {
  name: JOB_NAMES.reduceOldSnapshots,
  schedule: '0 4 * * 0',
  scheduleTimezone: 'Asia/Kolkata',
  handle: (_data, container) => reduceOldSnapshots(container),
};
