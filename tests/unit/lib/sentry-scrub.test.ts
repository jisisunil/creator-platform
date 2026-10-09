import type { ErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';
import { scrubSentryEvent } from '@/lib/sentry-scrub';

describe('scrubSentryEvent (PR-11)', () => {
  it('keeps only the user id and strips request details', () => {
    const event: ErrorEvent = {
      type: undefined,
      user: { id: 'user_1', email: 'someone@example.com', ip_address: '1.2.3.4' },
      request: {
        method: 'POST',
        url: 'https://app.example/en/reset?token=secret',
        cookies: { session: 'abc' },
        headers: { authorization: 'Bearer x' },
        data: { password: 'hunter2' },
      },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.user).toEqual({ id: 'user_1' });
    expect(scrubbed.request).toEqual({ method: 'POST', url: 'https://app.example/en/reset' });
  });

  it('drops console breadcrumbs, which may contain personal data', () => {
    const event: ErrorEvent = {
      type: undefined,
      breadcrumbs: [
        { category: 'console', message: 'debug output' },
        { category: 'navigation', message: '/en' },
      ],
    };

    expect(scrubSentryEvent(event).breadcrumbs).toEqual([
      { category: 'navigation', message: '/en' },
    ]);
  });
});
