import type { Prisma } from '@/generated/prisma/client';
import type { DbClient } from './db-client';

export type AuditCategory = 'SECURITY' | 'ADMIN' | 'DATA';

export interface AuditEventInput {
  readonly category: AuditCategory;
  readonly action: string;
  readonly actorUserId?: string | null;
  readonly subjectUserId?: string | null;
  readonly ipAddress?: string | null;
  /** Must not contain passwords, tokens, chat content or unmasked emails (SR-13). */
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;

/** Append-only audit log (SR-13). */
export function createAuditRepository(db: DbClient) {
  return {
    async record(event: AuditEventInput): Promise<void> {
      await db.auditEvent.create({
        data: { ...event, metadata: event.metadata as Prisma.InputJsonValue | undefined },
      });
    },

    /** Whether this user has signed in from this device in the retained log (SEC-9). */
    async hasSignedInFromDevice(userId: string, deviceHash: string): Promise<boolean> {
      const count = await db.auditEvent.count({
        where: {
          action: 'login.success',
          subjectUserId: userId,
          metadata: { path: ['deviceHash'], equals: deviceHash },
        },
      });
      return count > 0;
    },

    async hasAnySignIn(userId: string): Promise<boolean> {
      const count = await db.auditEvent.count({
        where: { action: 'login.success', subjectUserId: userId },
      });
      return count > 0;
    },

    async deleteOlderThan(cutoff: Date): Promise<number> {
      const result = await db.auditEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
      return result.count;
    },
  };
}
