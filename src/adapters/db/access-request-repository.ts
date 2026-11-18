import type { SelfServiceRole } from '@/domain/accounts';
import type { DbClient } from './db-client';

export type AccessRequestStatus = 'PENDING' | 'APPROVED';

export interface AccessRequestRecord {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: SelfServiceRole;
  readonly city: string | null;
  readonly profileUrl: string | null;
  readonly locale: string;
  readonly status: AccessRequestStatus;
  readonly approvedAt: Date | null;
  readonly createdAt: Date;
}

export interface NewAccessRequest {
  readonly email: string;
  readonly name: string;
  readonly role: SelfServiceRole;
  readonly city: string | null;
  readonly profileUrl: string | null;
  readonly locale: string;
}

const ACCESS_REQUEST_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  city: true,
  profileUrl: true,
  locale: true,
  status: true,
  approvedAt: true,
  createdAt: true,
} as const;

function toRecord(row: {
  id: string;
  email: string;
  name: string;
  role: 'CREATOR' | 'BRAND' | 'ADMIN';
  city: string | null;
  profileUrl: string | null;
  locale: string;
  status: AccessRequestStatus;
  approvedAt: Date | null;
  createdAt: Date;
}): AccessRequestRecord {
  // The table's check constraint rules out ADMIN; this keeps the type honest.
  if (row.role === 'ADMIN') throw new Error(`access request ${row.id} has role ADMIN`);
  return { ...row, role: row.role };
}

export type AccessRequestRepository = ReturnType<typeof createAccessRequestRepository>;

/** The pilot waitlist: requests to join while sign-up is invite-only. */
export function createAccessRequestRepository(db: DbClient) {
  return {
    /** Adds a request; does nothing if the address already asked (the first one stands). */
    async addIfAbsent(request: NewAccessRequest): Promise<void> {
      await db.accessRequest.createMany({ data: [request], skipDuplicates: true });
    },

    async list(status: AccessRequestStatus, page: { offset: number; limit: number }) {
      const where = { status };
      const [rows, total] = await Promise.all([
        db.accessRequest.findMany({
          where,
          orderBy: status === 'PENDING' ? { createdAt: 'asc' } : { approvedAt: 'desc' },
          skip: page.offset,
          take: page.limit,
          select: ACCESS_REQUEST_SELECT,
        }),
        db.accessRequest.count({ where }),
      ]);
      return { items: rows.map(toRecord), total };
    },

    /** Approves a pending request; null if it doesn't exist or was already handled. */
    async approve(id: string, now: Date): Promise<AccessRequestRecord | null> {
      const result = await db.accessRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'APPROVED', approvedAt: now },
      });
      if (result.count === 0) return null;
      const row = await db.accessRequest.findUnique({
        where: { id },
        select: ACCESS_REQUEST_SELECT,
      });
      return row ? toRecord(row) : null;
    },

    /** Deletes a request; false if it was already gone. */
    async delete(id: string): Promise<boolean> {
      return (await db.accessRequest.deleteMany({ where: { id } })).count > 0;
    },

    async isApproved(email: string): Promise<boolean> {
      const row = await db.accessRequest.findFirst({
        where: { email, status: 'APPROVED' },
        select: { id: true },
      });
      return row !== null;
    },

    /** Once the person has an account the request has served its purpose. */
    async deleteByEmail(email: string): Promise<void> {
      await db.accessRequest.deleteMany({ where: { email } });
    },

    async deleteCreatedBefore(cutoff: Date): Promise<number> {
      return (await db.accessRequest.deleteMany({ where: { createdAt: { lt: cutoff } } })).count;
    },
  };
}
