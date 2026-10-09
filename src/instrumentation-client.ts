import * as Sentry from '@sentry/nextjs';
import { SENTRY_DATA_COLLECTION, scrubSentryEvent } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  dataCollection: SENTRY_DATA_COLLECTION,
  tracesSampleRate: 0.1,
  beforeSend: scrubSentryEvent,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
