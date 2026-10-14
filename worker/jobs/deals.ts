import { JOB_NAMES } from '@/config/jobs';
import { refreshDealPosts, sendDealReminders } from '@/services/deals';
import type { JobDefinition } from '../job-definition';

/** UC-R4 / UC-R5: daily deadline and overdue-payment reminders, in the morning in India. */
export const sendDealRemindersJob: JobDefinition = {
  name: JOB_NAMES.sendDealReminders,
  schedule: '0 9 * * *',
  scheduleTimezone: 'Asia/Kolkata',
  handle: (_data, container) => sendDealReminders(container),
};

/** UC-R6: daily refresh of post stats for campaign reports, after the account refresh. */
export const refreshDealPostsJob: JobDefinition = {
  name: JOB_NAMES.refreshDealPosts,
  schedule: '0 5 * * *',
  scheduleTimezone: 'Asia/Kolkata',
  handle: (_data, container) => refreshDealPosts(container),
};
