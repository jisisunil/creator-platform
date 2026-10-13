import { JOB_NAMES } from '@/config/jobs';
import type { JobDefinition } from '../job-definition';

/**
 * Proves the worker is alive and processing scheduled jobs (NFR-10). Monitoring alerts when
 * no heartbeat has completed recently.
 */
export const heartbeatJob: JobDefinition = {
  name: JOB_NAMES.heartbeat,
  schedule: '*/5 * * * *',
  scheduleTimezone: 'UTC',
  handle: async () => ({ beats: 1 }),
};
