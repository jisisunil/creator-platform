import { JOB_NAMES } from '@/config/jobs';
import { expireRequests } from '@/services/requests';
import type { JobDefinition } from '../job-definition';

/** FR-7.2: hourly expiry of requests left unanswered for 14 days. */
export const expireRequestsJob: JobDefinition = {
  name: JOB_NAMES.expireRequests,
  schedule: '5 * * * *',
  scheduleTimezone: 'Asia/Kolkata',
  handle: (_data, container) => expireRequests(container),
};
