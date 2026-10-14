import { z } from 'zod';
import { SOCIAL_REFRESH } from '@/config/creators';
import { JOB_NAMES } from '@/config/jobs';
import { queueDueRefreshes, refreshSocialAccount } from '@/services/social';
import type { JobDefinition } from '../job-definition';

/** FR-3.4 / NFR-3: every day, queue a refresh for each account that needs one. */
export const queueDueRefreshesJob: JobDefinition = {
  name: JOB_NAMES.queueDueRefreshes,
  schedule: SOCIAL_REFRESH.schedule,
  scheduleTimezone: SOCIAL_REFRESH.timezone,
  handle: (_data, container) => queueDueRefreshes(container),
};

const refreshDataSchema = z.object({ accountId: z.string().min(1) });

/** UC-C4: refresh one account; temporary errors retry with back-off. */
export const refreshSocialAccountJob: JobDefinition = {
  name: JOB_NAMES.refreshSocialAccount,
  retry: {
    limit: SOCIAL_REFRESH.transientRetryLimit,
    delaySeconds: SOCIAL_REFRESH.transientRetryDelaySeconds,
  },
  async handle(data, container) {
    const { accountId } = refreshDataSchema.parse(data);
    const outcome = await refreshSocialAccount(container, accountId);
    return { [outcome]: 1 };
  },
};
