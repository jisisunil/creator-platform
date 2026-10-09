import * as Sentry from '@sentry/nextjs';
import { SENTRY_DATA_COLLECTION, scrubSentryEvent } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.APP_ENV,
  dataCollection: SENTRY_DATA_COLLECTION,
  tracesSampleRate: 0.1,
  beforeSend: scrubSentryEvent,
});
