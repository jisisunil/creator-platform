import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const MIN_SECRET_LENGTH = 32;
const ENCRYPTION_KEY_BYTES = 32;

const base64Key = z
  .string()
  .refine((value) => Buffer.from(value, 'base64').length === ENCRYPTION_KEY_BYTES, {
    message: `must be ${ENCRYPTION_KEY_BYTES} random bytes, base64-encoded`,
  });

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    APP_URL: z.url(),
    DATABASE_URL: z.url(),
    /** Direct (non-pooled) connection for migrations and the job queue; defaults to DATABASE_URL. */
    DATABASE_DIRECT_URL: z.url().optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(15_000),
    DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(5_000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    SENTRY_DSN: z.url().optional(),

    AUTH_SECRET: z.string().min(MIN_SECRET_LENGTH),
    TOKEN_ENCRYPTION_KEY: base64Key,
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),

    SMTP_URL: z.url(),
    EMAIL_FROM: z.string().min(3),
    /** Where brands ask to change plan or buy credit packs (no online payments yet). */
    SALES_EMAIL: z.email().default('sales@example.invalid'),
    /** SR-14: where monitoring alerts are emailed (optional; alerts are always logged). */
    ALERT_EMAIL: z.email().optional(),

    TURNSTILE_SECRET_KEY: z.string().optional(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
    BREACHED_PASSWORD_CHECK: z.enum(['hibp', 'offline']).default('hibp'),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

    SOCIAL_PROVIDER_MODE: z.enum(['mock', 'live']).default('mock'),
    YOUTUBE_API_KEY: z.string().optional(),
    INSTAGRAM_APP_ID: z.string().optional(),
    INSTAGRAM_APP_SECRET: z.string().optional(),

    FILE_STORAGE_DIR: z.string().min(1).default('./storage'),
    MALWARE_SCANNER: z.enum(['clamav', 'disabled']).default('disabled'),
    CLAMAV_HOST: z.string().default('localhost'),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65_535).default(3310),
  })
  .superRefine((env, context) => {
    const isLive = env.APP_ENV === 'production' || env.APP_ENV === 'staging';
    if (isLive && !(env.TURNSTILE_SECRET_KEY && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)) {
      context.addIssue({
        code: 'custom',
        path: ['TURNSTILE_SECRET_KEY'],
        message: 'CAPTCHA keys are required outside development (SR-3, SR-11)',
      });
    }
    if (isLive && env.SOCIAL_PROVIDER_MODE !== 'live') {
      context.addIssue({
        code: 'custom',
        path: ['SOCIAL_PROVIDER_MODE'],
        message: 'mock social providers are for development only',
      });
    }
    if (isLive && env.SALES_EMAIL.endsWith('.invalid')) {
      context.addIssue({
        code: 'custom',
        path: ['SALES_EMAIL'],
        message: 'set a real sales address outside development',
      });
    }
    if (isLive && env.MALWARE_SCANNER === 'disabled') {
      context.addIssue({
        code: 'custom',
        path: ['MALWARE_SCANNER'],
        message: 'uploads must be scanned outside development (SR-9)',
      });
    }
    const hasLiveKeys =
      env.YOUTUBE_API_KEY &&
      env.AUTH_GOOGLE_ID &&
      env.AUTH_GOOGLE_SECRET &&
      env.INSTAGRAM_APP_ID &&
      env.INSTAGRAM_APP_SECRET;
    if (env.SOCIAL_PROVIDER_MODE === 'live' && !hasLiveKeys) {
      context.addIssue({
        code: 'custom',
        path: ['SOCIAL_PROVIDER_MODE'],
        message:
          'live mode needs YOUTUBE_API_KEY, AUTH_GOOGLE_ID/SECRET and INSTAGRAM_APP_ID/SECRET',
      });
    }
    if (Boolean(env.AUTH_GOOGLE_ID) !== Boolean(env.AUTH_GOOGLE_SECRET)) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_GOOGLE_ID'],
        message: 'set both AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, or neither',
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Parses environment variables; throws a readable error listing every invalid variable. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(emptyStringsToUndefined(source));
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}

// .env files often contain `KEY=` for unset optional values.
function emptyStringsToUndefined(
  source: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, value === '' ? undefined : value]),
  );
}

let cachedEnv: ServerEnv | undefined;

/** Validated server environment, parsed once on first use. */
export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseServerEnv(process.env);
  return cachedEnv;
}

/** Pool settings for this process (ADR-005). */
export function databasePoolOptions(env: ServerEnv) {
  return {
    maxConnections: env.DATABASE_POOL_MAX,
    statementTimeoutMs: env.DATABASE_STATEMENT_TIMEOUT_MS,
    connectionTimeoutMs: env.DATABASE_CONNECT_TIMEOUT_MS,
  };
}

/** The connection for session-level work (migrations, pg-boss locks), bypassing PgBouncer. */
export function directDatabaseUrl(env: ServerEnv): string {
  return env.DATABASE_DIRECT_URL ?? env.DATABASE_URL;
}

/** Settings for the social provider registry (FR-3). */
export function socialProviderSettings(env: ServerEnv) {
  return {
    mode: env.SOCIAL_PROVIDER_MODE,
    appUrl: env.APP_URL,
    youtube:
      env.YOUTUBE_API_KEY && env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET
        ? {
            apiKey: env.YOUTUBE_API_KEY,
            clientId: env.AUTH_GOOGLE_ID,
            clientSecret: env.AUTH_GOOGLE_SECRET,
          }
        : undefined,
    instagram:
      env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET
        ? { appId: env.INSTAGRAM_APP_ID, appSecret: env.INSTAGRAM_APP_SECRET }
        : undefined,
  };
}

/** True when Google sign-in is configured. */
export function isGoogleSignInEnabled(env: ServerEnv): boolean {
  return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
}
