import type { EmailTemplateName, EmailTemplates } from '@/adapters/email/templates';
import { Prisma } from '@/generated/prisma/client';
import type { DbClient } from './db-client';

export interface OutboxEmail {
  readonly id: string;
  readonly toAddress: string;
  readonly template: EmailTemplateName;
  readonly locale: string;
  readonly payload: unknown;
  readonly attempts: number;
}

export type QueuedEmail = {
  [Name in EmailTemplateName]: {
    readonly userId: string | null;
    readonly toAddress: string;
    readonly locale: string;
    readonly template: Name;
    readonly payload: EmailTemplates[Name];
  };
}[EmailTemplateName];

export type EmailOutboxRepository = ReturnType<typeof createEmailOutboxRepository>;

/** Transactional email outbox. */
export function createEmailOutboxRepository(db: DbClient) {
  return {
    async add(email: QueuedEmail): Promise<void> {
      await db.emailOutbox.create({
        data: { ...email, payload: email.payload as unknown as Prisma.InputJsonValue },
      });
    },

    /**
     * Locks the oldest pending email so concurrent workers never send it twice. Call inside
     * a transaction and finish with markSent/markFailed in the same transaction.
     */
    async lockNextPending(): Promise<OutboxEmail | null> {
      const rows = await db.$queryRaw<OutboxEmail[]>`
        SELECT "id", "toAddress", "template", "locale", "payload", "attempts"
        FROM "EmailOutbox"
        WHERE "status" = 'PENDING'
        ORDER BY "createdAt"
        LIMIT 1
        FOR UPDATE SKIP LOCKED`;
      return rows[0] ?? null;
    },

    /** Marks an email sent and clears its payload, which may hold one-time links. */
    async markSent(id: string, sentAt: Date): Promise<void> {
      await db.emailOutbox.update({
        where: { id },
        data: { status: 'SENT', sentAt, payload: Prisma.DbNull, lastError: null },
      });
    },

    async markAttemptFailed(id: string, error: string, isFinal: boolean): Promise<void> {
      await db.emailOutbox.update({
        where: { id },
        data: {
          attempts: { increment: 1 },
          lastError: error.slice(0, 500),
          status: isFinal ? 'FAILED' : 'PENDING',
          ...(isFinal ? { payload: Prisma.DbNull } : {}),
        },
      });
    },

    async deleteFinishedBefore(cutoff: Date): Promise<number> {
      const result = await db.emailOutbox.deleteMany({
        where: { status: { in: ['SENT', 'FAILED'] }, updatedAt: { lt: cutoff } },
      });
      return result.count;
    },
  };
}
