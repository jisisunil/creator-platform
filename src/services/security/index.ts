import { hashToken } from '@/adapters/crypto/random-token';
import type { AuditEventInput } from '@/adapters/db/audit-repository';
import type { Repositories } from '@/adapters/db/repositories';
import { RATE_LIMITS, type RateLimitRule } from '@/config/auth';
import { notAllowed, rateLimited } from '@/domain/errors';
import { getLogger } from '@/lib/logger';

export type RateLimitName = keyof typeof RATE_LIMITS;

const logger = getLogger('security');

/** Start of the fixed window containing `now`. */
export function windowStartFor(rule: RateLimitRule, now: Date): Date {
  return new Date(Math.floor(now.getTime() / rule.windowMs) * rule.windowMs);
}

// Keys are hashed so the table never holds raw IPs or emails.
function counterKey(name: string, subject: string): string {
  return hashToken(`${name}:${subject}`);
}

/**
 * Counts one attempt against a limit (SR-3, SR-11) and throws RATE_LIMITED once it is
 * exceeded. A null subject (e.g. unknown IP) is still limited, as one shared bucket.
 */
export async function consumeRateLimit(
  repos: Repositories,
  now: Date,
  name: RateLimitName,
  subject: string | null,
): Promise<void> {
  const rule = RATE_LIMITS[name];
  const count = await repos.rateLimits.increment(
    counterKey(name, subject ?? 'unknown'),
    windowStartFor(rule, now),
  );
  if (count > rule.limit) {
    logger.warn({ action: 'rate-limit.exceeded', limit: name }, 'rate limit exceeded');
    throw rateLimited();
  }
}

/** Failure counters that drive the CAPTCHA requirement (SR-3). Share the sign-in window. */
export const failureCounters = {
  async record(repos: Repositories, now: Date, kind: 'account' | 'ip', subject: string | null) {
    const rule = RATE_LIMITS.signInPerAccount;
    await repos.rateLimits.increment(
      counterKey(`signInFailure:${kind}`, subject ?? 'unknown'),
      windowStartFor(rule, now),
    );
  },
  async current(
    repos: Repositories,
    now: Date,
    kind: 'account' | 'ip',
    subject: string | null,
  ): Promise<number> {
    const rule = RATE_LIMITS.signInPerAccount;
    return repos.rateLimits.current(
      counterKey(`signInFailure:${kind}`, subject ?? 'unknown'),
      windowStartFor(rule, now),
    );
  },
  async clearAccount(repos: Repositories, now: Date, subject: string) {
    const rule = RATE_LIMITS.signInPerAccount;
    await repos.rateLimits.reset(
      counterKey('signInFailure:account', subject),
      windowStartFor(rule, now),
    );
  },
};

/** Writes a security event to the audit log (SR-13). */
export async function recordSecurityEvent(
  repos: Repositories,
  event: Omit<AuditEventInput, 'category'>,
): Promise<void> {
  await repos.audit.record({ ...event, category: 'SECURITY' });
}

/**
 * Admins only (SR-5, SEC-11): an active admin account. The session's two-factor check
 * happens in the page and action guards.
 */
export async function requireAdmin(repos: Repositories, userId: string): Promise<void> {
  const user = await repos.users.findById(userId);
  if (user?.role !== 'ADMIN' || user.status !== 'ACTIVE') throw notAllowed();
}
