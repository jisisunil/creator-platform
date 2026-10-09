import 'dotenv/config';
import { PgBoss } from 'pg-boss';
import { getContainer } from '@/adapters/container';
import { getServerEnv } from '@/config/env';
import { getLogger } from '@/lib/logger';
import { ALL_JOBS } from './jobs';
import { runJob } from './run-job';

const logger = getLogger('worker');

/** Background worker entry point: registers every job's queue, schedule and handler. */
async function main(): Promise<void> {
  const env = getServerEnv();
  const container = getContainer();
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' });
  boss.on('error', (error) => logger.error({ err: error }, 'pg-boss error'));

  await boss.start();

  for (const job of ALL_JOBS) {
    await boss.createQueue(job.name);
    await boss.work<object>(job.name, async (batch) => {
      for (const item of batch) {
        await runJob(job, item.data, container);
      }
    });
    if (job.schedule) {
      await boss.schedule(job.name, job.schedule, null, { tz: job.scheduleTimezone ?? 'UTC' });
    }
  }
  logger.info({ jobs: ALL_JOBS.map((job) => job.name) }, 'worker started');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'worker stopping');
    await boss.stop({ graceful: true });
    await container.db.$disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'worker failed to start');
  process.exit(1);
});
