import { JOB_NAMES } from '@/config/jobs';
import { finaliseDeletions } from '@/services/privacy';
import type { JobDefinition } from '../job-definition';

/** PRV-4: daily anonymisation of accounts whose 30-day deletion period has passed. */
export const finaliseDeletionsJob: JobDefinition = {
  name: JOB_NAMES.finaliseDeletions,
  schedule: '45 3 * * *',
  scheduleTimezone: 'Asia/Kolkata',
  handle: (_data, container) => finaliseDeletions(container),
};
