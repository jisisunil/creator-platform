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

export interface AuditEventRecord {
  readonly id: string;
  readonly category: AuditCategory;
  readonly action: string;
  readonly actorUserId: string | null;
  readonly actorName: string | null;
  readonly subjectUserId: string | null;
  readonly ipAddress: string | null;
  readonly metadata: Prisma.JsonValue;
  readonly createdAt: Date;
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;

/** Append-only audit log (SR-13). */
export function createAuditRepository(db: DbClient) {
  return {
    /** SR-14: how many events of this action happened since a time. */
    countActionSince: (action: string, since: Date): Promise<number> =>
      db.auditEvent.count({ where: { action, createdAt: { gte: since } } }),

    /** SR-14: admin actions since a time (for the off-hours check). */
    listAdminActionsSince: (since: Date) =>
      db.auditEvent.findMany({
        where: { category: 'ADMIN', createdAt: { gte: since } },
        select: { action: true, actorUserId: true, createdAt: true },
      }),

    /** FR-13.3: the audit log, newest first, with optional filters. */
    async list(
      filters: { category?: AuditCategory; action?: string; actorUserId?: string },
      page: { offset: number; limit: number },
    ): Promise<{ items: AuditEventRecord[]; total: number }> {
      const where: Prisma.AuditEventWhereInput = {
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.action ? { action: { startsWith: filters.action } } : {}),
        ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
      };
      const [rows, total] = await Promise.all([
        db.auditEvent.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: page.offset,
          take: page.limit,
          select: {
            id: true,
            category: true,
            action: true,
            actorUserId: true,
            subjectUserId: true,
            ipAddress: true,
            metadata: true,
            createdAt: true,
          },
        }),
        db.auditEvent.count({ where }),
      ]);
      // No foreign key on purpose: the log outlives deleted accounts (SR-13).
      const actorIds = [
        ...new Set(rows.flatMap((row) => (row.actorUserId ? [row.actorUserId] : []))),
      ];
      const actors = await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      });
      const nameById = new Map(actors.map((actor) => [actor.id, actor.name]));
      return {
        items: rows.map((row) => ({
          ...row,
          actorName: row.actorUserId ? (nameById.get(row.actorUserId) ?? null) : null,
        })),
        total,
      };
    },

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
