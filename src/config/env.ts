import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  APP_URL: z.url(),
  DATABASE_URL: z.url(),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  SENTRY_DSN: z.url().optional(),
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
