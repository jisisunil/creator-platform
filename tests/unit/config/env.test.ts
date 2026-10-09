import { describe, expect, it } from 'vitest';
import { parseServerEnv } from '@/config/env';

const VALID = {
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
};

describe('parseServerEnv (SR-10)', () => {
  it('accepts a valid environment and applies defaults', () => {
    const env = parseServerEnv(VALID);

    expect(env.APP_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('treats empty optional values as unset', () => {
    const env = parseServerEnv({ ...VALID, SENTRY_DSN: '' });

    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('lists every invalid variable without echoing secret values', () => {
    const run = () => parseServerEnv({ APP_URL: 'not a url', DATABASE_URL: 'secret-value' });

    expect(run).toThrow(/APP_URL/);
    expect(run).toThrow(/DATABASE_URL/);
    expect(run).not.toThrow(/secret-value/);
  });
});
