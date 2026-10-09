import { randomUUID } from 'node:crypto';
import type { Container } from '@/adapters/container';
import { getLogger } from '@/lib/logger';
import { runWithRequestContext } from '@/lib/request-context';
import type { JobDefinition } from './job-definition';

const logger = getLogger('worker');

/**
 * Runs one job with structured logs for start, finish, duration, counts and failure
 * (CLAUDE.md §12). Failures are rethrown so pg-boss applies its retry policy.
 */
export async function runJob<Data extends object>(
  job: JobDefinition<Data>,
  data: Data,
  container: Container,
): Promise<void> {
  await runWithRequestContext({ requestId: randomUUID() }, async () => {
    const startedAt = performance.now();
    logger.info({ action: job.name, event: 'job.start' }, 'job started');
    try {
      const counts = await job.handle(data, container);
      const durationMs = Math.round(performance.now() - startedAt);
      logger.info({ action: job.name, event: 'job.finish', durationMs, counts }, 'job finished');
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      logger.error({ action: job.name, event: 'job.fail', durationMs, err: error }, 'job failed');
      throw error;
    }
  });
}
