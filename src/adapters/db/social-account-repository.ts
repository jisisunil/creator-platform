import type { AccountHistory } from '@/domain/score';
import type { Prisma } from '@/generated/prisma/client';
import type {
  AudienceShare,
  PlatformAccount,
  ProviderErrorKind,
  SocialPlatform,
} from '../social/provider';
import type { DbClient } from './db-client';

export type SocialAccountStatus = 'ACTIVE' | 'TOKEN_REVOKED' | 'PRIVATE' | 'DELETED';

export interface SocialAccountForRefresh {
  readonly id: string;
  readonly creatorId: string;
  readonly platform: SocialPlatform;
  readonly externalId: string;
  readonly accessTokenEncrypted: string | null;
  readonly refreshTokenEncrypted: string | null;
  readonly tokenExpiresAt: Date | null;
  readonly status: SocialAccountStatus;
}

export interface NewSocialAccount {
  readonly creatorId: string;
  readonly platform: SocialPlatform;
  readonly externalId: string;
  readonly handle: string;
  readonly displayName: string;
  readonly isVerified: boolean;
  readonly verifiedAt: Date | null;
  readonly accessTokenEncrypted: string | null;
  readonly refreshTokenEncrypted: string | null;
  readonly tokenExpiresAt: Date | null;
  /** Q-43: a handle the creator typed in; never verified or refreshed. */
  readonly isSelfReported?: boolean;
  readonly selfReportedFollowers?: number | null;
}

export interface SnapshotValues {
  readonly followers: number;
  readonly mediaCount: number;
  readonly posts30d: number;
  readonly views30d: number | null;
  readonly likes30d: number;
  readonly comments30d: number;
}

export interface PendingConnection {
  readonly id: string;
  readonly platform: SocialPlatform;
  readonly accessTokenEncrypted: string;
  readonly refreshTokenEncrypted: string | null;
  readonly tokenExpiresAt: Date | null;
  readonly accounts: readonly PlatformAccount[];
}

/** What refreshAccount records in lastRefreshError when the platform's quota ran out. */
const QUOTA_EXCEEDED_ERROR: ProviderErrorKind = 'QUOTA_EXCEEDED';

const FOR_REFRESH_SELECT = {
  id: true,
  creatorId: true,
  platform: true,
  externalId: true,
  accessTokenEncrypted: true,
  refreshTokenEncrypted: true,
  tokenExpiresAt: true,
  status: true,
} as const;

/** UTC calendar day (snapshots are one per day). */
export function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export type SocialAccountRepository = ReturnType<typeof createSocialAccountRepository>;

/** Connected accounts, their daily snapshots and audience, pending logins and disputes (FR-3). */
export function createSocialAccountRepository(db: DbClient) {
  return {
    findClaim: (platform: SocialPlatform, externalId: string) =>
      db.socialAccount.findUnique({
        where: { platform_externalId: { platform, externalId } },
        select: { id: true, creatorId: true, isVerified: true },
      }),

    async create(account: NewSocialAccount): Promise<string> {
      const created = await db.socialAccount.create({ data: account, select: { id: true } });
      return created.id;
    },

    /** Upgrades an unverified link to verified with fresh tokens (same creator, FR-3.3). */
    async markVerified(
      id: string,
      tokens: {
        accessTokenEncrypted: string;
        refreshTokenEncrypted: string | null;
        tokenExpiresAt: Date | null;
      },
      verifiedAt: Date,
    ): Promise<void> {
      await db.socialAccount.update({
        where: { id },
        data: { ...tokens, isVerified: true, verifiedAt, status: 'ACTIVE' },
      });
    },

    /** Null for self-reported accounts: there is nothing to fetch for them (Q-43). */
    findForRefresh: (id: string): Promise<SocialAccountForRefresh | null> =>
      db.socialAccount.findFirst({
        where: { id, isSelfReported: false },
        select: FOR_REFRESH_SELECT,
      }),

    /** Accounts on a platform with this handle (any creator), ignoring case and the "@". */
    findByHandle: (platform: SocialPlatform, username: string) =>
      db.socialAccount.findMany({
        where: { platform, handle: { equals: `@${username}`, mode: 'insensitive' } },
        select: { id: true, creatorId: true, isSelfReported: true },
      }),

    /**
     * Q-43: removes self-reported accounts the official login supersedes: the connecting
     * creator's own on that platform, and anyone else's that claimed the same handle.
     * Returns the creators affected, so their scores can be recomputed.
     */
    async deleteSelfReportedSupersededBy(input: {
      platform: SocialPlatform;
      creatorId: string;
      handle: string;
    }): Promise<string[]> {
      const where = {
        platform: input.platform,
        isSelfReported: true,
        OR: [
          { creatorId: input.creatorId },
          { handle: { equals: input.handle, mode: 'insensitive' as const } },
        ],
      };
      const rows = await db.socialAccount.findMany({ where, select: { creatorId: true } });
      await db.socialAccount.deleteMany({ where });
      return [...new Set(rows.map((row) => row.creatorId))];
    },

    /**
     * Data inventory: daily snapshots older than `before` are reduced to the first one of
     * each month per account, enough for long-term growth charts. Returns rows removed.
     */
    async reduceSnapshotsBefore(before: Date): Promise<number> {
      return db.$executeRaw`
        DELETE FROM "StatsSnapshot"
        WHERE "capturedOn" < ${before}
          AND id NOT IN (
            SELECT DISTINCT ON ("socialAccountId", date_trunc('month', "capturedOn")) id
            FROM "StatsSnapshot"
            WHERE "capturedOn" < ${before}
            ORDER BY "socialAccountId", date_trunc('month', "capturedOn"), "capturedOn"
          )`;
    },

    /** The creator's working accounts on a platform (UC-R6 post ownership). */
    async listActiveIds(creatorId: string, platform: SocialPlatform): Promise<string[]> {
      const rows = await db.socialAccount.findMany({
        where: { creatorId, platform, status: 'ACTIVE', isSelfReported: false },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    },

    async countForCreator(creatorId: string): Promise<number> {
      return db.socialAccount.count({ where: { creatorId } });
    },

    /** Accounts due for the daily refresh (NFR-3), oldest first. */
    async listDueForRefresh(now: Date, refreshedBefore: Date, limit: number): Promise<string[]> {
      const rows = await db.socialAccount.findMany({
        where: {
          status: 'ACTIVE',
          isSelfReported: false,
          OR: [{ lastRefreshedAt: null }, { lastRefreshedAt: { lt: refreshedBefore } }],
          AND: [{ OR: [{ nextRefreshAt: null }, { nextRefreshAt: { lte: now } }] }],
        },
        orderBy: { lastRefreshedAt: { sort: 'asc', nulls: 'first' } },
        take: limit,
        select: { id: true },
      });
      return rows.map((row) => row.id);
    },

    /**
     * NFR-3 / NFR-13: active accounts whose last refresh hit the platform's API quota, per
     * platform, and how many have data older than `staleBefore`.
     */
    async refreshHealth(
      staleBefore: Date,
    ): Promise<{ quotaHitsByPlatform: Partial<Record<SocialPlatform, number>>; stale: number }> {
      const quotaRows = await db.socialAccount.groupBy({
        by: ['platform'],
        where: { status: 'ACTIVE', lastRefreshError: QUOTA_EXCEEDED_ERROR },
        _count: { _all: true },
      });
      // Self-reported accounts are never refreshed, so they are never "stale" (Q-43).
      const stale = await db.socialAccount.count({
        where: {
          status: 'ACTIVE',
          isSelfReported: false,
          OR: [
            { lastRefreshedAt: { lt: staleBefore } },
            { lastRefreshedAt: null, createdAt: { lt: staleBefore } },
          ],
        },
      });
      return {
        quotaHitsByPlatform: Object.fromEntries(
          quotaRows.map((row) => [row.platform, row._count._all]),
        ),
        stale,
      };
    },

    async updateTokens(
      id: string,
      tokens: {
        accessTokenEncrypted: string;
        refreshTokenEncrypted: string | null;
        tokenExpiresAt: Date | null;
      },
    ): Promise<void> {
      await db.socialAccount.update({ where: { id }, data: tokens });
    },

    async recordRefreshSuccess(
      id: string,
      values: { handle: string; displayName: string; isFollowerCountHidden: boolean; at: Date },
    ): Promise<void> {
      await db.socialAccount.update({
        where: { id },
        data: {
          handle: values.handle,
          displayName: values.displayName,
          isFollowerCountHidden: values.isFollowerCountHidden,
          lastRefreshedAt: values.at,
          lastRefreshError: null,
          nextRefreshAt: null,
          status: 'ACTIVE',
        },
      });
    },

    /** Records a failed refresh; keeps the last good data (UC-C4). */
    async recordRefreshFailure(
      id: string,
      failure: { status: SocialAccountStatus; error: string; nextRefreshAt: Date | null },
    ): Promise<void> {
      await db.socialAccount.update({
        where: { id },
        data: {
          status: failure.status,
          lastRefreshError: failure.error.slice(0, 300),
          nextRefreshAt: failure.nextRefreshAt,
        },
      });
    },

    async upsertSnapshot(socialAccountId: string, day: Date, stats: SnapshotValues): Promise<void> {
      const capturedOn = utcDay(day);
      // Copy field by field: callers may pass richer objects (e.g. provider stats).
      const values = {
        followers: stats.followers,
        mediaCount: stats.mediaCount,
        posts30d: stats.posts30d,
        views30d: stats.views30d,
        likes30d: stats.likes30d,
        comments30d: stats.comments30d,
      };
      await db.statsSnapshot.upsert({
        where: { socialAccountId_capturedOn: { socialAccountId, capturedOn } },
        create: { socialAccountId, capturedOn, ...values },
        update: values,
      });
    },

    /** Replaces the audience breakdown with the latest one (aggregate data only, PR-8). */
    async replaceAudience(
      socialAccountId: string,
      shares: readonly AudienceShare[],
      day: Date,
    ): Promise<void> {
      await db.audienceSegment.deleteMany({ where: { socialAccountId } });
      await db.audienceSegment.createMany({
        data: shares.map((share) => ({ ...share, socialAccountId, capturedOn: utcDay(day) })),
      });
    },

    /** Snapshot history since a date for every account of a creator, for the score. */
    async historyForCreator(creatorId: string, since: Date): Promise<AccountHistory[]> {
      const accounts = await db.socialAccount.findMany({
        where: { creatorId, status: 'ACTIVE' },
        select: {
          id: true,
          isFollowerCountHidden: true,
          snapshots: {
            where: { capturedOn: { gte: utcDay(since) } },
            orderBy: { capturedOn: 'asc' },
            select: {
              capturedOn: true,
              followers: true,
              posts30d: true,
              views30d: true,
              likes30d: true,
              comments30d: true,
            },
          },
        },
      });
      return accounts.map((account) => ({
        accountId: account.id,
        isFollowerCountHidden: account.isFollowerCountHidden,
        history: account.snapshots,
      }));
    },

    /** Daily follower counts per account for charts (UC-C7). */
    async followerSeries(creatorId: string, since: Date) {
      return db.socialAccount.findMany({
        where: { creatorId },
        select: {
          id: true,
          platform: true,
          handle: true,
          snapshots: {
            where: { capturedOn: { gte: utcDay(since) } },
            orderBy: { capturedOn: 'asc' },
            select: { capturedOn: true, followers: true },
          },
        },
      });
    },

    /** UC-D4: each active account of these creators with its newest snapshot. */
    async latestStatsForCreators(creatorIds: readonly string[]) {
      return db.socialAccount.findMany({
        where: { creatorId: { in: [...creatorIds] }, status: 'ACTIVE' },
        select: {
          creatorId: true,
          platform: true,
          handle: true,
          isVerified: true,
          isFollowerCountHidden: true,
          snapshots: {
            orderBy: { capturedOn: 'desc' },
            take: 1,
            select: {
              followers: true,
              posts30d: true,
              views30d: true,
              likes30d: true,
              comments30d: true,
            },
          },
          audience: { select: { dimension: true, bucket: true, sharePermille: true } },
        },
      });
    },

    /** Aggregate audience shares across a creator's accounts (PR-8). */
    async audienceForCreator(creatorId: string) {
      return db.audienceSegment.findMany({
        where: { socialAccount: { creatorId } },
        orderBy: [{ dimension: 'asc' }, { sharePermille: 'desc' }],
        select: { dimension: true, bucket: true, sharePermille: true },
      });
    },

    /**
     * Deletes an account the creator owns, with its tokens, snapshots and audience
     * (UC-C5, PRV-7, PR-14). False if it isn't theirs.
     */
    async deleteOwned(creatorId: string, accountId: string): Promise<boolean> {
      const result = await db.socialAccount.deleteMany({ where: { id: accountId, creatorId } });
      return result.count === 1;
    },

    async createPending(data: {
      userId: string;
      platform: SocialPlatform;
      accessTokenEncrypted: string;
      refreshTokenEncrypted: string | null;
      tokenExpiresAt: Date | null;
      accounts: readonly PlatformAccount[];
      expiresAt: Date;
    }): Promise<string> {
      const created = await db.pendingSocialConnection.create({
        data: { ...data, accounts: data.accounts as unknown as Prisma.InputJsonValue },
        select: { id: true },
      });
      return created.id;
    },

    /** A pending login of this user that hasn't expired. */
    async findPending(id: string, userId: string, now: Date): Promise<PendingConnection | null> {
      const row = await db.pendingSocialConnection.findFirst({
        where: { id, userId, expiresAt: { gt: now } },
        select: {
          id: true,
          platform: true,
          accessTokenEncrypted: true,
          refreshTokenEncrypted: true,
          tokenExpiresAt: true,
          accounts: true,
        },
      });
      if (!row) return null;
      return { ...row, accounts: row.accounts as unknown as PlatformAccount[] };
    },

    async deletePending(id: string): Promise<void> {
      await db.pendingSocialConnection.deleteMany({ where: { id } });
    },

    async deleteExpiredPending(now: Date): Promise<number> {
      const result = await db.pendingSocialConnection.deleteMany({
        where: { expiresAt: { lte: now } },
      });
      return result.count;
    },

    /** UC-C2/UC-C3: someone else has claimed this account; an admin decides (UC-M3). */
    async createDispute(data: {
      socialAccountId: string;
      claimantUserId: string;
      isClaimVerified: boolean;
    }): Promise<void> {
      const existing = await db.ownershipDispute.count({
        where: { ...data, status: 'OPEN' },
      });
      if (existing === 0) await db.ownershipDispute.create({ data });
    },
  };
}
