/** Retention module: deletes data that is no longer needed (PR-9, SR-13). */
import type { Clock } from '@/adapters/clock';
import type { Repositories } from '@/adapters/db/repositories';
import { UNVERIFIED_ACCOUNT_RETENTION_MS } from '@/config/auth';
import {
  AUDIT_LOG_RETENTION_MS,
  EMAIL_OUTBOX_RETENTION_MS,
  RATE_LIMIT_RETENTION_MS,
} from '@/config/retention';

export interface RetentionDependencies {
  readonly repos: Repositories;
  readonly clock: Clock;
}

/** UC-A1 / PR-9: deletes accounts whose email was never verified within 7 days. */
export async function purgeUnverifiedAccounts(
  deps: RetentionDependencies,
): Promise<{ deletedAccounts: number }> {
  const cutoff = new Date(deps.clock.now().getTime() - UNVERIFIED_ACCOUNT_RETENTION_MS);
  return { deletedAccounts: await deps.repos.users.deleteUnverifiedCreatedBefore(cutoff) };
}

/** Removes expired sessions, links, invites and counters, and logs older than a year. */
export async function purgeExpiredSecurityData(
  deps: RetentionDependencies,
): Promise<Record<string, number>> {
  const now = deps.clock.now();
  const ago = (ms: number) => new Date(now.getTime() - ms);
  return {
    sessions: await deps.repos.sessions.deleteExpired(now),
    oneTimeLinks: await deps.repos.oneTimeTokens.deleteExpired(now),
    teamInvites: await deps.repos.brands.deleteExpiredInvites(now),
    rateLimitWindows: await deps.repos.rateLimits.deleteWindowsBefore(ago(RATE_LIMIT_RETENTION_MS)),
    emails: await deps.repos.emailOutbox.deleteFinishedBefore(ago(EMAIL_OUTBOX_RETENTION_MS)),
    auditEvents: await deps.repos.audit.deleteOlderThan(ago(AUDIT_LOG_RETENTION_MS)),
  };
}
