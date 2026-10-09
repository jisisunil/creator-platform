import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  readonly requestId: string;
  readonly userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with a request context so logs carry the same requestId. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** The current request context, if any. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** A new request id, or the incoming one when it looks safe to reuse. */
export function resolveRequestId(incoming: string | null): string {
  const isSafe = incoming !== null && /^[A-Za-z0-9-]{8,64}$/.test(incoming);
  return isSafe ? incoming : randomUUID();
}
