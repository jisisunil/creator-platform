import pino, { type Logger } from 'pino';
import { getRequestContext } from './request-context';

// Keys that must never reach logs (SR-13, CLAUDE.md §8). Matched at any depth up to 2.
const SECRET_KEYS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'authorization',
  'cookie',
  'body', // chat message bodies
  'email',
  'phone',
];

const REDACT_PATHS = SECRET_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]);

function createRootLogger(): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: undefined,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    mixin: () => {
      const context = getRequestContext();
      return context ? { requestId: context.requestId, userId: context.userId } : {};
    },
  });
}

const rootLogger = createRootLogger();

/** A structured JSON logger for one module. Never pass chat content, tokens or full emails. */
export function getLogger(module: string): Logger {
  return rootLogger.child({ module });
}
