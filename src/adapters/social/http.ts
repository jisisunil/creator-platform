import { SocialProviderError } from './provider';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 400;

export interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
}

/**
 * Calls a platform API with a timeout and up to three attempts for network errors and 5xx
 * responses, backing off between them (CLAUDE.md §6). Other statuses are returned as-is for
 * the provider to map to a typed error.
 */
export async function requestJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit = {},
): Promise<HttpResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await response.text();
      const body: unknown = text ? JSON.parse(text) : null;
      if (response.status < 500) return { status: response.status, body };
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, BASE_BACKOFF_MS * 2 ** (attempt - 1)));
    }
  }
  throw new SocialProviderError('TRANSIENT', String(lastError));
}

/** Reads a nested value safely from untyped JSON. */
export function pick(value: unknown, ...path: readonly (string | number)[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

/** A number from JSON that may arrive as a string (YouTube does this); 0 when absent. */
export function toCount(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed)
    ? Math.max(0, Math.round(parsed))
    : 0;
}

/** Start of the 30-day window used for "recent" figures. */
export function recentWindowStart(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}
