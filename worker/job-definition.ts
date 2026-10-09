import type { Container } from '@/adapters/container';

/** A background job: its queue name, optional cron schedule, and handler. */
export interface JobDefinition<Data extends object = object> {
  readonly name: string;
  /** Cron expression, evaluated in `scheduleTimezone`. Omit for on-demand jobs. */
  readonly schedule?: string;
  readonly scheduleTimezone?: string;
  /** Returns counts to log (e.g. `{ refreshed: 120, failed: 2 }`). */
  readonly handle: (data: Data, container: Container) => Promise<Readonly<Record<string, number>>>;
}
