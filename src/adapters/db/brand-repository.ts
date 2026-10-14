import type { DbClient } from './db-client';

export type BrandMemberRole = 'OWNER' | 'MEMBER';

/** The plan limits and features a brand has (FR-11.1). */
export interface PlanAllowance {
  readonly code: string;
  readonly seatLimit: number;
  readonly shortlistLimit: number;
  readonly profileViewsPerHour: number;
  readonly canSaveSearch: boolean;
  readonly canCompare: boolean;
  readonly canCsvExport: boolean;
  readonly canCampaignReports: boolean;
  readonly billingPeriod: 'NONE' | 'MONTHLY';
  readonly contactRequestsPerPeriod: number;
  readonly usesCreditPacks: boolean;
}

export interface BrandMembership {
  readonly brandId: string;
  readonly brandName: string;
  readonly countryCode: string;
  readonly role: BrandMemberRole;
  readonly seatLimit: number;
  readonly planStartedAt: Date;
  readonly trialEndsAt: Date | null;
  readonly plan: PlanAllowance;
}

export interface TeamMember {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: BrandMemberRole;
  readonly joinedAt: Date;
}

export interface PendingInvite {
  readonly id: string;
  readonly email: string;
  readonly expiresAt: Date;
}

export interface UsableInvite {
  readonly id: string;
  readonly brandId: string;
  readonly brandName: string;
  readonly email: string;
}

export type BrandRepository = ReturnType<typeof createBrandRepository>;

/** Brands, their members and team invites (UC-A6). */
export function createBrandRepository(db: DbClient) {
  return {
    async createWithOwner(data: {
      name: string;
      industry: string;
      countryCode: string;
      emailDomain: string | null;
      planId: string;
      planStartedAt: Date;
      trialEndsAt: Date | null;
      hasHadTrial: boolean;
      ownerUserId: string;
    }): Promise<string> {
      const { ownerUserId, ...brand } = data;
      const created = await db.brand.create({
        data: { ...brand, members: { create: { userId: ownerUserId, role: 'OWNER' } } },
        select: { id: true },
      });
      return created.id;
    },

    async findMembership(userId: string): Promise<BrandMembership | null> {
      const row = await db.brandMember.findUnique({
        where: { userId },
        select: {
          role: true,
          brand: {
            select: {
              id: true,
              name: true,
              countryCode: true,
              planStartedAt: true,
              trialEndsAt: true,
              plan: {
                select: {
                  code: true,
                  seatLimit: true,
                  shortlistLimit: true,
                  profileViewsPerHour: true,
                  canSaveSearch: true,
                  canCompare: true,
                  canCsvExport: true,
                  canCampaignReports: true,
                  billingPeriod: true,
                  contactRequestsPerPeriod: true,
                  usesCreditPacks: true,
                },
              },
            },
          },
        },
      });
      if (!row) return null;
      return {
        brandId: row.brand.id,
        brandName: row.brand.name,
        countryCode: row.brand.countryCode,
        role: row.role,
        seatLimit: row.brand.plan.seatLimit,
        planStartedAt: row.brand.planStartedAt,
        trialEndsAt: row.brand.trialEndsAt,
        plan: row.brand.plan,
      };
    },

    /**
     * Locks the brand row until the transaction ends, so concurrent requests from one brand
     * check and use the plan allowance one at a time (UC-B2).
     */
    async lockForUpdate(brandId: string): Promise<void> {
      await db.$queryRaw`SELECT id FROM "Brand" WHERE id = ${brandId} FOR UPDATE`;
    },

    /** Name and public details shown to creators (never members' emails, SR-12). */
    findPublicDetails: (
      brandId: string,
    ): Promise<{ id: string; name: string; industry: string; website: string | null } | null> =>
      db.brand.findUnique({
        where: { id: brandId },
        select: { id: true, name: true, industry: true, website: true },
      }),

    /** Members who can still be reached: active accounts, owner first. */
    async activeMemberIds(brandId: string): Promise<string[]> {
      const rows = await db.brandMember.findMany({
        where: { brandId, user: { status: 'ACTIVE' } },
        // Enum order is OWNER, MEMBER.
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: { userId: true },
      });
      return rows.map((row) => row.userId);
    },

    countMembers: (brandId: string): Promise<number> =>
      db.brandMember.count({ where: { brandId } }),

    countPendingInvites: (brandId: string, now: Date): Promise<number> =>
      db.brandInvite.count({
        where: { brandId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      }),

    async listMembers(brandId: string): Promise<TeamMember[]> {
      const rows = await db.brandMember.findMany({
        where: { brandId },
        orderBy: { createdAt: 'asc' },
        select: {
          role: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      });
      return rows.map((row) => ({
        userId: row.user.id,
        name: row.user.name,
        email: row.user.email,
        role: row.role,
        joinedAt: row.createdAt,
      }));
    },

    listPendingInvites: (brandId: string, now: Date): Promise<PendingInvite[]> =>
      db.brandInvite.findMany({
        where: { brandId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, expiresAt: true },
      }),

    async hasPendingInviteFor(brandId: string, email: string, now: Date): Promise<boolean> {
      const count = await db.brandInvite.count({
        where: { brandId, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      });
      return count > 0;
    },

    async createInvite(data: {
      brandId: string;
      email: string;
      tokenHash: string;
      invitedByUserId: string;
      expiresAt: Date;
    }): Promise<void> {
      await db.brandInvite.create({ data });
    },

    async findUsableInvite(tokenHash: string, now: Date): Promise<UsableInvite | null> {
      const row = await db.brandInvite.findFirst({
        where: { tokenHash, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        select: { id: true, email: true, brand: { select: { id: true, name: true } } },
      });
      if (!row) return null;
      return { id: row.id, email: row.email, brandId: row.brand.id, brandName: row.brand.name };
    },

    /** Marks an invite accepted. False if it was already used or revoked. */
    async acceptInvite(id: string, acceptedAt: Date): Promise<boolean> {
      const result = await db.brandInvite.updateMany({
        where: { id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt },
      });
      return result.count === 1;
    },

    /** Revokes a pending invite of this brand. False if none matched. */
    async revokeInvite(brandId: string, inviteId: string, revokedAt: Date): Promise<boolean> {
      const result = await db.brandInvite.updateMany({
        where: { id: inviteId, brandId, acceptedAt: null, revokedAt: null },
        data: { revokedAt },
      });
      return result.count === 1;
    },

    async addMember(brandId: string, userId: string, role: BrandMemberRole): Promise<void> {
      await db.brandMember.create({ data: { brandId, userId, role } });
    },

    /** Removes a non-owner member of this brand. False if no such member. */
    async removeMember(brandId: string, userId: string): Promise<boolean> {
      const result = await db.brandMember.deleteMany({
        where: { brandId, userId, role: 'MEMBER' },
      });
      return result.count === 1;
    },

    async deleteExpiredInvites(now: Date): Promise<number> {
      const result = await db.brandInvite.deleteMany({
        where: { acceptedAt: null, expiresAt: { lte: now } },
      });
      return result.count;
    },
  };
}
