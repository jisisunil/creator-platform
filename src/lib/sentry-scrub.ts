import type { ErrorEvent } from '@sentry/nextjs';

/**
 * Tells the Sentry SDK not to collect personal data in the first place (PR-11): no user
 * details, cookies, headers, bodies, query strings, DB/queue payloads or local variables.
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

/**
 * Second line of defence before an event leaves for Sentry (CLAUDE.md §12): keeps only the
 * user id and the request method and path.
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  const userId = event.user?.id;
  return {
    ...event,
    user: userId === undefined ? undefined : { id: userId },
    request: event.request
      ? { method: event.request.method, url: stripQuery(event.request.url) }
      : undefined,
    breadcrumbs: event.breadcrumbs?.filter((crumb) => crumb.category !== 'console'),
  };
}

function stripQuery(url: string | undefined): string | undefined {
  return url?.split('?')[0];
}
