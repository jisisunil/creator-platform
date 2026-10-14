import type { UserRole, UserStatus } from '@/domain/accounts';
import type { Prisma } from '@/generated/prisma/client';
import type { DbClient } from './db-client';

export interface PlatformMetrics {
  readonly signUps: number;
  readonly activeUsers: number;
  readonly creators: number;
  readonly brands: number;
  readonly requestsSent: number;
  readonly dealsCompleted: number;
  readonly openReports: number;
  readonly openFlags: number;
  readonly openDisputes: number;
}

export interface UserListItem {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly createdAt: Date;
  readonly lastLoginAt: Date | null;
}

export interface UserDetail extends UserListItem {
  readonly emailVerifiedAt: Date | null;
  readonly creator: {
    readonly id: string;
    readonly slug: string;
    readonly displayName: string;
    readonly isSearchable: boolean;
    readonly accounts: readonly { platform: string; handle: string; status: string }[];
  } | null;
  readonly brand: {
    readonly id: string;
    readonly name: string;
    readonly role: 'OWNER' | 'MEMBER';
    readonly planCode: string;
    readonly trialEndsAt: Date | null;
  } | null;
}

const USER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
} as const satisfies Prisma.UserSelect;

export type AdminRepository = ReturnType<typeof createAdminRepository>;

/** Read models for the admin console (FR-13). */
export function createAdminRepository(db: DbClient) {
  return {
    /** FR-13.4: platform figures since a date, plus the open moderation queues. */
    async metricsSince(since: Date): Promise<PlatformMetrics> {
      const people = { role: { in: ['CREATOR', 'BRAND'] as UserRole[] } };
      const [
        signUps,
        activeUsers,
        creators,
        brands,
        requestsSent,
        dealsCompleted,
        openReports,
        openFlags,
        openDisputes,
      ] = await Promise.all([
        db.user.count({ where: { ...people, createdAt: { gte: since } } }),
        db.user.count({ where: { ...people, lastLoginAt: { gte: since } } }),
        db.user.count({ where: { role: 'CREATOR', status: 'ACTIVE' } }),
        db.brand.count(),
        db.collabRequest.count({ where: { createdAt: { gte: since } } }),
        db.deal.count({ where: { completedAt: { gte: since } } }),
        db.report.count({ where: { status: 'OPEN' } }),
        db.authenticityFlag.count({ where: { status: 'OPEN' } }),
        db.ownershipDispute.count({ where: { status: 'OPEN' } }),
      ]);
      return {
        signUps,
        activeUsers,
        creators,
        brands,
        requestsSent,
        dealsCompleted,
        openReports,
        openFlags,
        openDisputes,
      };
    },

    /** FR-13.1: users by name or email, newest first. */
    async searchUsers(
      filters: { query?: string; role?: UserRole; status?: UserStatus },
      page: { offset: number; limit: number },
    ): Promise<{ items: UserListItem[]; total: number }> {
      const where: Prisma.UserWhereInput = {
        ...(filters.role ? { role: filters.role } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.query
          ? {
              OR: [
                { email: { contains: filters.query, mode: 'insensitive' } },
                { name: { contains: filters.query, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        db.user.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: page.offset,
          take: page.limit,
          select: USER_LIST_SELECT,
        }),
        db.user.count({ where }),
      ]);
      return { items, total };
    },

    async findUserDetail(userId: string): Promise<UserDetail | null> {
      const row = await db.user.findUnique({
        where: { id: userId },
        select: {
          ...USER_LIST_SELECT,
          emailVerifiedAt: true,
          creatorProfile: {
            select: {
              id: true,
              slug: true,
              displayName: true,
              isSearchable: true,
              socialAccounts: { select: { platform: true, handle: true, status: true } },
            },
          },
          brandMember: {
            select: {
              role: true,
              brand: {
                select: {
                  id: true,
                  name: true,
                  trialEndsAt: true,
                  plan: { select: { code: true } },
                },
              },
            },
          },
        },
      });
      if (!row) return null;
      const { creatorProfile, brandMember, ...user } = row;
      return {
        ...user,
        creator: creatorProfile
          ? { ...creatorProfile, accounts: creatorProfile.socialAccounts }
          : null,
        brand: brandMember
          ? {
              id: brandMember.brand.id,
              name: brandMember.brand.name,
              role: brandMember.role,
              planCode: brandMember.brand.plan.code,
              trialEndsAt: brandMember.brand.trialEndsAt,
            }
          : null,
      };
    },

    async setUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<void> {
      await db.user.update({ where: { id: userId }, data: { status } });
    },

    async setPlatformSetting(key: string, value: boolean): Promise<void> {
      await db.platformSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    },
  };
}
