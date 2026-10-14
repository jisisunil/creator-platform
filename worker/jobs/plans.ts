import { JOB_NAMES } from '@/config/jobs';
import { sendTrialReminders } from '@/services/plans';
import type { JobDefinition } from '../job-definition';

/** UC-B1 / UC-D1: daily "trial ends soon" and "trial ended" emails, in the morning in India. */
export const sendTrialRemindersJob: JobDefinition = {
  name: JOB_NAMES.sendTrialReminders,
  schedule: '30 9 * * *',
  scheduleTimezone: 'Asia/Kolkata',
  handle: (_data, container) => sendTrialReminders(container),
};
