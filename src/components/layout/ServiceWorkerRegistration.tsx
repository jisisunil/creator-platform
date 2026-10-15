'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * NFR-5: registers the offline service worker. Skipped in development, where a cached
 * page would get in the way of hot reload.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    // The site works without it (only the offline page is lost), so just report it.
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      Sentry.captureException(error);
    });
  }, []);
  return null;
}
