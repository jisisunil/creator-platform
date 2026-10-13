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
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    SENTRY_DSN: z.url().optional(),

    AUTH_SECRET: z.string().min(MIN_SECRET_LENGTH),
    TOKEN_ENCRYPTION_KEY: base64Key,
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),

    SMTP_URL: z.url(),
    EMAIL_FROM: z.string().min(3),

    TURNSTILE_SECRET_KEY: z.string().optional(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
    BREACHED_PASSWORD_CHECK: z.enum(['hibp', 'offline']).default('hibp'),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
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

/** True when Google sign-in is configured. */
export function isGoogleSignInEnabled(env: ServerEnv): boolean {
  return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
}
