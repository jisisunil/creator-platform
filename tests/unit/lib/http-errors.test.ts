import { describe, expect, it, vi } from 'vitest';
import { notFound, planLimitReached, validationFailed } from '@/domain/errors';
import { mapErrorToResponse } from '@/lib/http-errors';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

describe('mapErrorToResponse', () => {
  it('maps a domain error to its status and stable code', () => {
    const mapped = mapErrorToResponse(planLimitReached('requestsUsed'));

    expect(mapped.status).toBe(402);
    expect(mapped.body.error.code).toBe('PLAN_LIMIT_REACHED');
    expect(mapped.body.error.fieldErrors).toEqual({ plan: 'plan.requestsUsed' });
  });

  it('includes field errors for validation failures', () => {
    const mapped = mapErrorToResponse(validationFailed({ email: 'invalid' }));

    expect(mapped.status).toBe(400);
    expect(mapped.body.error.fieldErrors).toEqual({ email: 'invalid' });
  });

  it('SEC-2 returns 404 for resources owned by someone else', () => {
    expect(mapErrorToResponse(notFound()).status).toBe(404);
  });

  it('hides details of unexpected errors behind a generic 500', () => {
    const mapped = mapErrorToResponse(new Error('connection to 10.0.0.5 failed: password=hunter2'));

    expect(mapped.status).toBe(500);
    expect(JSON.stringify(mapped.body)).toBe('{"error":{"code":"INTERNAL"}}');
  });
});
