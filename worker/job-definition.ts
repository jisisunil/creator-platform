import type { Container } from '@/adapters/container';

/** A background job: its queue name, optional cron schedule, and handler. */
export interface JobDefinition<Data extends object = object> {
  readonly name: string;
  /** Cron expression, evaluated in `scheduleTimezone`. Omit for on-demand jobs. */
  readonly schedule?: string;
  readonly scheduleTimezone?: string;
  /** Retries for failures the handler rethrows (temporary errors), with exponential back-off. */
  readonly retry?: { readonly limit: number; readonly delaySeconds: number };
  /** Returns counts to log (e.g. `{ refreshed: 120, failed: 2 }`). */
  readonly handle: (data: Data, container: Container) => Promise<Readonly<Record<string, number>>>;
}
