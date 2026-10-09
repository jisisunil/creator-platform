import * as Sentry from '@sentry/nextjs';

/** Runs once per server start: validates env (fail fast) and starts error reporting. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getServerEnv } = await import('./config/env');
  getServerEnv();
  await import('../sentry.server.config');
}

export const onRequestError = Sentry.captureRequestError;
