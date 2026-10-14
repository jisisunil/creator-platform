import { JOB_NAMES } from '@/config/jobs';
import { finaliseDeletions, handleInactiveAccounts } from '@/services/privacy';
import type { JobDefinition } from '../job-definition';

/** PRV-4: daily anonymisation of accounts whose 30-day deletion period has passed. */
export const finaliseDeletionsJob: JobDefinition = {
  name: JOB_NAMES.finaliseDeletions,
  schedule: '45 3 * * *',
  scheduleTimezone: 'Asia/Kolkata',
  handle: (_data, container) => finaliseDeletions(container),
};

/** PR-9: daily warnings and deletions for accounts unused for 3 years. */
export const handleInactiveAccountsJob: JobDefinition = {
  name: JOB_NAMES.handleInactiveAccounts,
  schedule: '0 4 * * *',
  scheduleTimezone: 'Asia/Kolkata',
  handle: (_data, container) => handleInactiveAccounts(container),
};
