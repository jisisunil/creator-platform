import type { Prisma } from '@/generated/prisma/client';
import type { DbClient } from './db-client';

export type DataRequestType = 'EXPORT' | 'DELETION' | 'CORRECTION';
export type DataRequestStatus = 'OPEN' | 'COMPLETED' | 'REJECTED';

export interface DataRequestRecord {
  readonly id: string;
  readonly userId: string;
  readonly userName: string;
  readonly userEmail: string;
  readonly type: DataRequestType;
  readonly status: DataRequestStatus;
  readonly details: string | null;
  readonly dueAt: Date;
  readonly identityVerifiedAt: Date | null;
  readonly resolution: string | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
}

const REQUEST_SELECT = {
  id: true,
  userId: true,
  type: true,
  status: true,
  details: true,
  dueAt: true,
  identityVerifiedAt: true,
  resolution: true,
  completedAt: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
} as const satisfies Prisma.DataRequestSelect;

type RequestRow = Prisma.DataRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

function toRecord({ user, ...row }: RequestRow): DataRequestRecord {
  return { ...row, userName: user.name, userEmail: user.email };
}

/** Text that replaces a deleted person's name wherever others still see their activity. */
const DELETED_NAME = 'Deleted user';
const DELETED_BRAND = 'Deleted brand';

export type PrivacyRepository = ReturnType<typeof createPrivacyRepository>;

/** Data requests, data export and anonymisation (PR-5, PRV-2 to PRV-4, UC-M4). */
export function createPrivacyRepository(db: DbClient) {
  return {
    async createRequest(request: {
      userId: string;
      type: DataRequestType;
      status: DataRequestStatus;
      details: string | null;
      dueAt: Date;
      identityVerifiedAt: Date | null;
      completedAt: Date | null;
      createdAt: Date;
    }): Promise<string> {
      const created = await db.dataRequest.create({ data: request, select: { id: true } });
      return created.id;
    },

    async listRequests(status: DataRequestStatus, page: { offset: number; limit: number }) {
      const where = { status };
      const [rows, total] = await Promise.all([
        db.dataRequest.findMany({
          where,
          orderBy: status === 'OPEN' ? { dueAt: 'asc' } : { completedAt: 'desc' },
          skip: page.offset,
          take: page.limit,
          select: REQUEST_SELECT,
        }),
        db.dataRequest.count({ where }),
      ]);
      return { items: rows.map(toRecord), total };
    },

    async findRequest(id: string): Promise<DataRequestRecord | null> {
      const row = await db.dataRequest.findUnique({ where: { id }, select: REQUEST_SELECT });
      return row ? toRecord(row) : null;
    },

    async listOwnRequests(userId: string): Promise<DataRequestRecord[]> {
      const rows = await db.dataRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: REQUEST_SELECT,
      });
      return rows.map(toRecord);
    },

    /** Closes an open request; false if it was already handled. */
    async closeRequest(
      id: string,
      outcome: {
        status: 'COMPLETED' | 'REJECTED';
        resolution: string | null;
        handledByUserId: string | null;
        completedAt: Date;
      },
    ): Promise<boolean> {
      const result = await db.dataRequest.updateMany({
        where: { id, status: 'OPEN' },
        data: outcome,
      });
      return result.count === 1;
    },

    /** PR-5: open requests due before `before` (SLA alerts). */
    countOpenDueBefore: (before: Date): Promise<number> =>
      db.dataRequest.count({ where: { status: 'OPEN', dueAt: { lte: before } } }),

    /** PRV-4: deletion requests whose 30 days have passed. */
    async deletionsDue(now: Date, limit: number): Promise<{ id: string; userId: string }[]> {
      return db.dataRequest.findMany({
        where: { type: 'DELETION', status: 'OPEN', dueAt: { lte: now } },
        orderBy: { dueAt: 'asc' },
        take: limit,
        select: { id: true, userId: true },
      });
    },

    /**
     * PR-9: active creators and brand members whose last sign-in (or sign-up, if they never
     * signed in) is before `lastActiveBefore`. With `warnedBefore`, only those warned by then;
     * without it, only those not yet warned.
     */
    async inactiveUsers(
      lastActiveBefore: Date,
      warning: { warnedBefore: Date } | 'not-warned',
      limit: number,
    ) {
      return db.user.findMany({
        where: {
          status: 'ACTIVE',
          role: { in: ['CREATOR', 'BRAND'] },
          OR: [
            { lastLoginAt: { lt: lastActiveBefore } },
            { lastLoginAt: null, createdAt: { lt: lastActiveBefore } },
          ],
          inactivityWarnedAt: warning === 'not-warned' ? null : { lte: warning.warnedBefore },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: { id: true, name: true, email: true, locale: true },
      });
    },

    async markInactivityWarned(userId: string, at: Date): Promise<void> {
      await db.user.update({ where: { id: userId }, data: { inactivityWarnedAt: at } });
    },

    async setUserStatus(userId: string, status: 'DELETION_PENDING' | 'ACTIVE'): Promise<void> {
      await db.user.update({ where: { id: userId }, data: { status } });
    },

    /** PRV-4 / UC-A5: open requests of a closing account are withdrawn or declined. */
    async closeOpenRequests(owner: { brandId: string } | { creatorId: string }, now: Date) {
      const result = await db.collabRequest.updateMany({
        where: { ...owner, status: 'OPEN' },
        data: {
          status: 'brandId' in owner ? 'WITHDRAWN' : 'DECLINED',
          respondedAt: now,
          openPairKey: null,
        },
      });
      return result.count;
    },

    /**
     * PRV-2: everything the platform holds about the user, in plain objects. Messages are
     * the ones they sent; other people's messages are theirs to export.
     */
    async exportData(userId: string) {
      const user = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          countryCode: true,
          locale: true,
          emailVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true,
          consents: {
            orderBy: { createdAt: 'asc' },
            select: { kind: true, isGranted: true, noticeVersion: true, createdAt: true },
          },
          sessions: {
            select: { createdAt: true, lastSeenAt: true, userAgent: true, ipAddress: true },
          },
          notificationPreferences: { select: { category: true, channel: true, isEnabled: true } },
          notifications: {
            orderBy: { createdAt: 'desc' },
            select: { kind: true, params: true, createdAt: true, readAt: true },
          },
          dataRequests: {
            select: { type: true, status: true, details: true, createdAt: true, completedAt: true },
          },
          reports: { select: { targetType: true, reason: true, status: true, createdAt: true } },
          sentMessages: {
            orderBy: { createdAt: 'asc' },
            select: {
              body: true,
              createdAt: true,
              attachment: { select: { fileName: true, contentType: true, sizeBytes: true } },
              thread: { select: { request: { select: { campaign: { select: { name: true } } } } } },
            },
          },
          ratingsGiven: {
            select: {
              scores: true,
              comment: true,
              createdAt: true,
              deal: { select: { id: true } },
            },
          },
          creatorProfile: {
            select: {
              id: true,
              slug: true,
              displayName: true,
              bio: true,
              city: true,
              stateCode: true,
              countryCode: true,
              isOpenToCollaborations: true,
              createdAt: true,
              languages: { select: { languageCode: true } },
              categories: { select: { category: { select: { slug: true } } } },
              rateCard: { select: { deliverable: true, amountMinor: true, currency: true } },
              portfolio: { select: { url: true, brandName: true, collaboratedOn: true } },
              socialAccounts: {
                select: {
                  platform: true,
                  handle: true,
                  displayName: true,
                  isVerified: true,
                  isSelfReported: true,
                  selfReportedFollowers: true,
                  status: true,
                  createdAt: true,
                  snapshots: {
                    orderBy: { capturedOn: 'asc' },
                    select: {
                      capturedOn: true,
                      followers: true,
                      mediaCount: true,
                      posts30d: true,
                      views30d: true,
                      likes30d: true,
                      comments30d: true,
                    },
                  },
                },
              },
              scores: {
                orderBy: { computedAt: 'desc' },
                take: 30,
                select: { score: true, weightsVersion: true, computedAt: true },
              },
              requests: {
                select: {
                  createdAt: true,
                  status: true,
                  brief: true,
                  deliverables: true,
                  budgetMinor: true,
                  currencyCode: true,
                  deadline: true,
                  brand: { select: { name: true } },
                  campaign: { select: { name: true } },
                },
              },
              deals: {
                select: {
                  id: true,
                  status: true,
                  agreedAmountMinor: true,
                  currencyCode: true,
                  createdAt: true,
                  completedAt: true,
                  brand: { select: { name: true } },
                  campaign: { select: { name: true } },
                  posts: { select: { url: true, views: true, likes: true, comments: true } },
                },
              },
            },
          },
          brandMember: {
            select: {
              role: true,
              brand: {
                select: {
                  name: true,
                  industry: true,
                  website: true,
                  createdAt: true,
                  plan: { select: { code: true } },
                },
              },
            },
          },
          shortlists: {
            select: {
              name: true,
              isSharedWithTeam: true,
              items: { select: { note: true, creator: { select: { displayName: true } } } },
            },
          },
          savedSearches: { select: { name: true, filters: true, createdAt: true } },
          sentRequests: {
            select: {
              createdAt: true,
              status: true,
              brief: true,
              deliverables: true,
              budgetMinor: true,
              currencyCode: true,
              deadline: true,
              creator: { select: { displayName: true } },
              campaign: { select: { name: true } },
            },
          },
        },
      });
      const ratingsReceived = user.creatorProfile
        ? await db.rating.findMany({
            where: {
              raterSide: 'BRAND',
              isHidden: false,
              deal: { creatorId: user.creatorProfile.id },
            },
            select: { scores: true, comment: true, visibleFrom: true },
          })
        : [];
      return { ...user, ratingsReceived };
    },

    /**
     * PRV-4: removes the person's data. The user row stays (anonymised) so other people's
     * copies of requests, chats, deals and ratings show "Deleted user"; consent records are
     * kept for the legal hold and security logs until their 1-year expiry. Returns stored
     * files to delete.
     */
    async anonymiseUser(userId: string): Promise<{ fileKeys: string[] }> {
      const fileKeys: string[] = [];
      const user = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          creatorProfile: { select: { id: true, photoKey: true } },
          brandMember: { select: { brandId: true, role: true } },
        },
      });

      await db.session.deleteMany({ where: { userId } });
      await db.oneTimeToken.deleteMany({ where: { userId } });
      await db.authAccount.deleteMany({ where: { userId } });
      await db.notification.deleteMany({ where: { userId } });
      await db.notificationPreference.deleteMany({ where: { userId } });
      await db.pendingSocialConnection.deleteMany({ where: { userId } });
      await db.ownershipDispute.deleteMany({ where: { claimantUserId: userId } });
      await db.emailOutbox.deleteMany({ where: { userId } });
      await db.brandInvite.deleteMany({ where: { invitedByUserId: userId, acceptedAt: null } });
      await db.message.updateMany({
        where: { senderUserId: userId },
        data: { senderUserId: null },
      });
      await db.rating.updateMany({ where: { raterUserId: userId }, data: { raterUserId: null } });
      await db.collabRequest.updateMany({
        where: { sentByUserId: userId },
        data: { sentByUserId: null },
      });
      await db.dealEvent.updateMany({
        where: { actorUserId: userId },
        data: { actorUserId: null },
      });
      await db.report.updateMany({
        where: { reporterUserId: userId },
        data: { reporterUserId: null },
      });

      const creator = user.creatorProfile;
      if (creator) {
        if (creator.photoKey) fileKeys.push(creator.photoKey);
        await db.creatorLanguage.deleteMany({ where: { creatorId: creator.id } });
        await db.creatorCategory.deleteMany({ where: { creatorId: creator.id } });
        await db.rateCardItem.deleteMany({ where: { creatorId: creator.id } });
        await db.portfolioItem.deleteMany({ where: { creatorId: creator.id } });
        await db.socialAccount.deleteMany({ where: { creatorId: creator.id } });
        await db.scoreResult.deleteMany({ where: { creatorId: creator.id } });
        await db.authenticityFlag.deleteMany({ where: { creatorId: creator.id } });
        await db.creatorEmbedding.deleteMany({ where: { creatorId: creator.id } });
        await db.shortlistItem.deleteMany({ where: { creatorId: creator.id } });
        await db.profileView.deleteMany({ where: { creatorId: creator.id } });
        await db.creatorProfile.update({
          where: { id: creator.id },
          data: {
            slug: `deleted-${creator.id}`,
            displayName: DELETED_NAME,
            bio: '',
            photoKey: null,
            city: '',
            stateCode: '',
            isOpenToCollaborations: false,
            isSearchable: false,
            isVerified: false,
            totalFollowers: 0,
            engagementRateBp: 0,
            currentScore: null,
            growth90dBp: null,
          },
        });
      }

      const membership = user.brandMember;
      if (membership) {
        // Lists only this person could see go; lists shared with the team stay with it.
        await db.shortlist.deleteMany({
          where: { createdByUserId: userId, isSharedWithTeam: false },
        });
        await db.savedSearch.deleteMany({ where: { createdByUserId: userId } });
        await db.brandMember.delete({ where: { userId } });
        const others = await db.brandMember.count({ where: { brandId: membership.brandId } });
        if (others === 0) {
          await db.shortlist.deleteMany({ where: { brandId: membership.brandId } });
          await db.savedSearch.deleteMany({ where: { brandId: membership.brandId } });
          await db.brandInvite.deleteMany({ where: { brandId: membership.brandId } });
          await db.profileView.deleteMany({ where: { viewerBrandId: membership.brandId } });
          await db.brand.update({
            where: { id: membership.brandId },
            data: { name: DELETED_BRAND, website: null },
          });
        }
      }

      await db.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@deleted.invalid`,
          canonicalEmail: null,
          name: DELETED_NAME,
          passwordHash: null,
          totpSecretEncrypted: null,
          totpEnabledAt: null,
          failedLoginCount: 0,
          lockedUntil: null,
          status: 'ANONYMISED',
        },
      });
      return { fileKeys };
    },
  };
}
