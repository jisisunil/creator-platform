import type { UserRole, UserStatus } from '@/domain/accounts';
import { canonicalMailbox } from '@/domain/email-address';
import type { DbClient } from './db-client';

export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly passwordHash: string | null;
  readonly name: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly countryCode: string;
  readonly locale: string;
  readonly failedLoginCount: number;
  readonly lockedUntil: Date | null;
  readonly totpSecretEncrypted: string | null;
  readonly totpEnabledAt: Date | null;
}

export interface NewUser {
  readonly email: string;
  readonly passwordHash: string | null;
  readonly name: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly emailVerifiedAt: Date | null;
  readonly countryCode: string;
  readonly locale: string;
}

const USER_SELECT = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  passwordHash: true,
  name: true,
  role: true,
  status: true,
  countryCode: true,
  locale: true,
  failedLoginCount: true,
  lockedUntil: true,
  totpSecretEncrypted: true,
  totpEnabledAt: true,
} as const;

export type UserRepository = ReturnType<typeof createUserRepository>;

/** Users table access. Emails must already be normalised by the caller. */
export function createUserRepository(db: DbClient) {
  return {
    findById: (id: string): Promise<UserRecord | null> =>
      db.user.findUnique({ where: { id }, select: USER_SELECT }),

    findByEmail: (email: string): Promise<UserRecord | null> =>
      db.user.findUnique({ where: { email }, select: USER_SELECT }),

    create: (data: NewUser): Promise<UserRecord> =>
      db.user.create({
        data: { ...data, canonicalEmail: canonicalMailbox(data.email) },
        select: USER_SELECT,
      }),

    /** UC-B1: another brand owner uses the same mailbox (e.g. a "+tag" or Gmail dots). */
    async hasOtherBrandOwnerWithMailbox(canonicalEmail: string, exceptUserId: string) {
      const count = await db.user.count({
        where: { canonicalEmail, id: { not: exceptUserId }, brandMember: { role: 'OWNER' } },
      });
      return count > 0;
    },

    async updateLoginState(
      id: string,
      state: { failedLoginCount: number; lockedUntil: Date | null; lastLoginAt?: Date },
    ): Promise<void> {
      // Signing in is activity: any inactivity warning no longer applies (PR-9).
      const activity = state.lastLoginAt ? { inactivityWarnedAt: null } : {};
      await db.user.update({ where: { id }, data: { ...state, ...activity } });
    },

    /** Marks the email verified and activates a pending account. */
    async markEmailVerified(id: string, verifiedAt: Date): Promise<void> {
      await db.user.update({ where: { id }, data: { emailVerifiedAt: verifiedAt } });
      await db.user.updateMany({
        where: { id, status: 'PENDING_VERIFICATION' },
        data: { status: 'ACTIVE' },
      });
    },

    async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
      await db.user.update({
        where: { id },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      });
    },

    async updateEmail(id: string, email: string, verifiedAt: Date): Promise<void> {
      await db.user.update({
        where: { id },
        data: { email, canonicalEmail: canonicalMailbox(email), emailVerifiedAt: verifiedAt },
      });
    },

    async setTotpSecret(id: string, totpSecretEncrypted: string): Promise<void> {
      await db.user.update({ where: { id }, data: { totpSecretEncrypted, totpEnabledAt: null } });
    },

    async enableTotp(id: string, enabledAt: Date): Promise<void> {
      await db.user.update({ where: { id }, data: { totpEnabledAt: enabledAt } });
    },

    /** Deletes accounts still unverified after the retention period (UC-A1, PR-9). */
    async deleteUnverifiedCreatedBefore(cutoff: Date): Promise<number> {
      const result = await db.user.deleteMany({
        where: { status: 'PENDING_VERIFICATION', emailVerifiedAt: null, createdAt: { lt: cutoff } },
      });
      return result.count;
    },
  };
}
