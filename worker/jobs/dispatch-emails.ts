import { JOB_NAMES } from '@/config/jobs';
import { dispatchPendingEmails } from '@/services/email';
import type { JobDefinition } from '../job-definition';

const MAX_EMAILS_PER_RUN = 100;

/**
 * Sends queued emails (NFR-10 job monitoring). Runs when the web app nudges it and every
 * minute as a safety net, so nothing waits long if a nudge is lost.
 */
export const dispatchEmailsJob: JobDefinition = {
  name: JOB_NAMES.dispatchEmails,
  schedule: '* * * * *',
  scheduleTimezone: 'UTC',
  handle: (_data, container) => dispatchPendingEmails(container, MAX_EMAILS_PER_RUN),
};
