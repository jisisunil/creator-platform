import { describe, expect, it } from 'vitest';
import { parseServerEnv } from '@/config/env';

const VALID = {
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  AUTH_SECRET: 'x'.repeat(32),
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  SMTP_URL: 'smtp://localhost:1025',
  EMAIL_FROM: 'Test <no-reply@example.test>',
};

describe('parseServerEnv (SR-10)', () => {
  it('accepts a valid environment and applies defaults', () => {
    const env = parseServerEnv(VALID);

    expect(env.APP_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.BREACHED_PASSWORD_CHECK).toBe('hibp');
    expect(env.TRUSTED_PROXY_HOPS).toBe(0);
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('treats empty optional values as unset', () => {
    const env = parseServerEnv({ ...VALID, SENTRY_DSN: '' });

    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('lists every invalid variable without echoing secret values', () => {
    const run = () =>
      parseServerEnv({ ...VALID, APP_URL: 'not a url', AUTH_SECRET: 'tiny-secret' });

    expect(run).toThrow(/APP_URL/);
    expect(run).toThrow(/AUTH_SECRET/);
    expect(run).not.toThrow(/tiny-secret/);
  });

  it('SR-6 requires a 32-byte encryption key', () => {
    const run = () =>
      parseServerEnv({ ...VALID, TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') });

    expect(run).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  const PRODUCTION = {
    ...VALID,
    APP_ENV: 'production',
    TURNSTILE_SECRET_KEY: 'secret',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site',
    SOCIAL_PROVIDER_MODE: 'live',
    YOUTUBE_API_KEY: 'yt-key',
    AUTH_GOOGLE_ID: 'google-id',
    AUTH_GOOGLE_SECRET: 'google-secret',
    INSTAGRAM_APP_ID: 'ig-id',
    INSTAGRAM_APP_SECRET: 'ig-secret',
    MALWARE_SCANNER: 'clamav',
  };

  it('accepts a complete production configuration', () => {
    expect(() => parseServerEnv(PRODUCTION)).not.toThrow();
  });

  it('SR-3 requires CAPTCHA keys in production', () => {
    expect(() => parseServerEnv({ ...PRODUCTION, TURNSTILE_SECRET_KEY: '' })).toThrow(
      /TURNSTILE_SECRET_KEY/,
    );
  });

  it('FR-3 refuses mock social providers in production and live mode without keys', () => {
    expect(() => parseServerEnv({ ...PRODUCTION, SOCIAL_PROVIDER_MODE: 'mock' })).toThrow(
      /SOCIAL_PROVIDER_MODE/,
    );
    expect(() => parseServerEnv({ ...VALID, SOCIAL_PROVIDER_MODE: 'live' })).toThrow(
      /YOUTUBE_API_KEY/,
    );
  });

  it('SR-9 requires malware scanning in production', () => {
    expect(() => parseServerEnv({ ...PRODUCTION, MALWARE_SCANNER: 'disabled' })).toThrow(
      /MALWARE_SCANNER/,
    );
  });

  it('needs both Google sign-in values or neither', () => {
    expect(() => parseServerEnv({ ...VALID, AUTH_GOOGLE_ID: 'id' })).toThrow(/AUTH_GOOGLE_ID/);
  });
});
