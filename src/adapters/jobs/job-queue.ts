import { PgBoss } from 'pg-boss';
import type { JobName } from '@/config/jobs';
import { getLogger } from '@/lib/logger';

/** Asks the worker to run a job soon. */
export interface JobQueue {
  /**
   * Best effort: the work itself must already be recorded (e.g. an outbox row), and a
   * scheduled job picks it up if this nudge is lost.
   */
  enqueue(name: JobName, data?: object): Promise<void>;
}

const logger = getLogger('job-queue');

/**
 * pg-boss in send-only mode for the web process: no maintenance, scheduling or migrations,
 * which stay with the worker.
 */
export function createPgBossJobQueue(connectionString: string): JobQueue {
  let started: Promise<PgBoss> | undefined;
  const start = (): Promise<PgBoss> => {
    started ??= (async () => {
      const boss = new PgBoss({
        connectionString,
        schema: 'pgboss',
        supervise: false,
        schedule: false,
        migrate: false,
        registerInstance: false,
      });
      boss.on('error', (error) => logger.error({ err: error }, 'pg-boss error'));
      await boss.start();
      return boss;
    })();
    return started;
  };
  return {
    async enqueue(name, data) {
      try {
        const boss = await start();
        await boss.send(name, data ?? {});
      } catch (error) {
        started = undefined;
        logger.warn(
          { err: error, job: name },
          'could not enqueue job; scheduled run will catch up',
        );
      }
    },
  };
}
