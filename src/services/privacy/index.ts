/**
 * Privacy module: the user's data rights (PR-5): download my data (PRV-2), correct my data
 * (PRV-3), delete my account (PRV-4, UC-A5), and the admin handling of those requests
 * within 30 days (UC-M4, PRV-6).
 */
import type { DataRequestRecord, DataRequestStatus } from '@/adapters/db/privacy-repository';
import type { Repositories } from '@/adapters/db/repositories';
import type { UserRecord } from '@/adapters/db/user-repository';
import { DATA_REQUEST_DUE_MS } from '@/config/retention';
import { isAccountClosed } from '@/domain/accounts';
import { normaliseEmail } from '@/domain/email-address';
import { conflict, invalidState, notAllowed, notFound, validationFailed } from '@/domain/errors';
import { getLogger } from '@/lib/logger';
import type { RequestInfo, ServiceContext } from '../context';
import { cancelDealsForClosedAccount } from '../deals';
import { queueEmail, requestEmailDispatch } from '../email';
import { consumeRateLimit, requireAdmin } from '../security';

export type { DataRequestRecord, DataRequestStatus } from '@/adapters/db/privacy-repository';

const QUEUE_PAGE_SIZE = 25;
const DELETIONS_PER_RUN = 100;
const CORRECTION_MAX = 2000;
const logger = getLogger('privacy');

async function requireActiveUser(repos: Repositories, userId: string): Promise<UserRecord> {
  const user = await repos.users.findById(userId);
  if (!user || user.status !== 'ACTIVE') throw notAllowed();
  return user;
}

/**
 * PRV-2: everything the platform holds about the user as JSON: profile, stats, requests,
 * the messages they sent, deals, ratings, notifications and consent history. Never tokens
 * or password hashes. Rate-limited and logged (SR-13; SR-14 watches the volume).
 */
export async function exportMyData(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly request: RequestInfo },
): Promise<{ filename: string; json: string }> {
  const now = ctx.clock.now();
  await consumeRateLimit(ctx.repos, now, 'dataRequestsPerUser', input.userId);
  await requireActiveUser(ctx.repos, input.userId);
  const data = await ctx.repos.privacy.exportData(input.userId);
  await ctx.transaction(async (repos) => {
    await repos.privacy.createRequest({
      userId: input.userId,
      type: 'EXPORT',
      status: 'COMPLETED',
      details: null,
      dueAt: now,
      identityVerifiedAt: now,
      completedAt: now,
      createdAt: now,
    });
    await repos.audit.record({
      category: 'DATA',
      action: 'data.exported',
      actorUserId: input.userId,
      subjectUserId: input.userId,
      ipAddress: input.request.ipAddress,
    });
  });
  return {
    filename: `my-data-${now.toISOString().slice(0, 10)}.json`,
    json: JSON.stringify({ exportedAt: now.toISOString(), ...data }, null, 2),
  };
}

/**
 * PRV-3: most data is corrected directly in the profile and settings; verified stats and
 * other locked fields can't be, so the user asks here and an admin answers within 30 days.
 */
export async function requestCorrection(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly details: string },
): Promise<void> {
  const now = ctx.clock.now();
  await consumeRateLimit(ctx.repos, now, 'dataRequestsPerUser', input.userId);
  await requireActiveUser(ctx.repos, input.userId);
  await ctx.repos.privacy.createRequest({
    userId: input.userId,
    type: 'CORRECTION',
    status: 'OPEN',
    details: input.details.trim().slice(0, CORRECTION_MAX),
    dueAt: new Date(now.getTime() + DATA_REQUEST_DUE_MS),
    identityVerifiedAt: now,
    completedAt: null,
    createdAt: now,
  });
}

/** PR-5: the user's own privacy requests and where they stand. */
export async function listMyDataRequests(
  ctx: ServiceContext,
  userId: string,
): Promise<DataRequestRecord[]> {
  return ctx.repos.privacy.listOwnRequests(userId);
}

export interface DeletionImpact {
  /** Deals that will be cancelled, and requests that will be withdrawn or declined. */
  readonly openDeals: number;
  readonly openRequests: number;
  /** UC-A5: an owner with other members must hand the brand over first. */
  readonly mustTransferOwnership: boolean;
}

/** What closes with the account, the brand-team question included. */
async function closingScope(repos: Repositories, userId: string) {
  const creator = await repos.creators.findByUserId(userId);
  const membership = await repos.brands.findMembership(userId);
  const otherMembers = membership ? (await repos.brands.countMembers(membership.brandId)) - 1 : 0;
  // A brand's collaborations close only with its last member.
  const owner: { creatorId: string } | { brandId: string } | null = creator
    ? { creatorId: creator.id }
    : membership && otherMembers === 0
      ? { brandId: membership.brandId }
      : null;
  return { owner, membership, otherMembers };
}

/** UC-A5: what deleting the account will affect, shown before the user confirms. */
export async function getDeletionImpact(
  ctx: ServiceContext,
  userId: string,
): Promise<DeletionImpact> {
  const { owner, membership, otherMembers } = await closingScope(ctx.repos, userId);
  const now = ctx.clock.now();
  let openDeals = 0;
  let openRequests = 0;
  if (owner) {
    openDeals = (await ctx.repos.deals.listCancellable(owner)).length;
    openRequests =
      'creatorId' in owner
        ? await ctx.repos.requests.countOpenForCreator(owner.creatorId, now)
        : await ctx.repos.requests.countOpenForBrand(owner.brandId, now);
  }
  return {
    openDeals,
    openRequests,
    mustTransferOwnership: membership?.role === 'OWNER' && otherMembers > 0,
  };
}

/**
 * PRV-4 / UC-A5: the account is closed at once (signed out everywhere, hidden from search
 * and unable to sign in), its open requests are closed and deals cancelled with the other
 * side told, and the data is anonymised after 30 days by a daily job.
 */
async function beginDeletion(
  ctx: ServiceContext,
  repos: Repositories,
  user: UserRecord,
  now: Date,
): Promise<void> {
  const { owner } = await closingScope(repos, user.id);
  await repos.privacy.setUserStatus(user.id, 'DELETION_PENDING');
  await repos.sessions.deleteAllForUser(user.id);
  if (owner) {
    await repos.privacy.closeOpenRequests(owner, now);
    await cancelDealsForClosedAccount(repos, { owner, appUrl: ctx.appUrl, now });
  }
  const finalisedAt = new Date(now.getTime() + DATA_REQUEST_DUE_MS);
  await repos.privacy.createRequest({
    userId: user.id,
    type: 'DELETION',
    status: 'OPEN',
    details: null,
    dueAt: finalisedAt,
    identityVerifiedAt: now,
    completedAt: null,
    createdAt: now,
  });
  await queueEmail(repos, {
    userId: user.id,
    toAddress: user.email,
    locale: user.locale,
    template: 'accountDeletionScheduled',
    payload: { name: user.name, date: finalisedAt.toISOString().slice(0, 10) },
  });
}

/**
 * PRV-4: the user deletes their own account, confirming with their email address. A brand
 * owner with team members must make someone else the owner first (UC-A5).
 */
export async function deleteMyAccount(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly confirmEmail: string; readonly request: RequestInfo },
): Promise<void> {
  const now = ctx.clock.now();
  const user = await requireActiveUser(ctx.repos, input.userId);
  if (user.role === 'ADMIN') throw notAllowed();
  if (normaliseEmail(input.confirmEmail) !== user.email) {
    throw validationFailed({ confirmEmail: 'privacy.confirmEmail' });
  }
  if ((await getDeletionImpact(ctx, user.id)).mustTransferOwnership) throw conflict();
  await ctx.transaction(async (repos) => {
    await beginDeletion(ctx, repos, user, now);
    await repos.audit.record({
      category: 'DATA',
      action: 'account.deletion-requested',
      actorUserId: user.id,
      subjectUserId: user.id,
      ipAddress: input.request.ipAddress,
    });
  });
  await requestEmailDispatch(ctx.jobQueue);
  logger.info({ action: 'account.deletion-requested' }, 'account deletion requested');
}

/** The user an admin acts on: never an admin, and not already closed. */
async function requireDeletableUser(repos: Repositories, userId: string): Promise<UserRecord> {
  const user = await repos.users.findById(userId);
  if (!user) throw notFound();
  if (user.role === 'ADMIN') throw notAllowed();
  if (isAccountClosed(user.status)) throw invalidState();
  return user;
}

/** An owner leaving a team hands the brand to the longest-standing member. */
async function handOverBrandIfNeeded(repos: Repositories, userId: string): Promise<void> {
  const membership = await repos.brands.findMembership(userId);
  if (membership?.role !== 'OWNER') return;
  const [nextOwner] = (await repos.brands.activeMemberIds(membership.brandId)).filter(
    (memberId) => memberId !== userId,
  );
  if (nextOwner) await repos.brands.transferOwnership(membership.brandId, userId, nextOwner);
}

/**
 * FR-13.1: an admin deletes a user (30-day finalisation, like a self-service deletion). A
 * brand owner's brand passes to the longest-standing member. Audited with the reason.
 */
export async function scheduleAccountDeletion(
  ctx: ServiceContext,
  input: {
    readonly adminUserId: string;
    readonly userId: string;
    readonly reason: string;
    readonly request: RequestInfo;
  },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const user = await requireDeletableUser(ctx.repos, input.userId);
  await ctx.transaction(async (repos) => {
    await handOverBrandIfNeeded(repos, user.id);
    await beginDeletion(ctx, repos, user, ctx.clock.now());
    await repos.audit.record({
      category: 'ADMIN',
      action: 'user.deletion-scheduled',
      actorUserId: input.adminUserId,
      subjectUserId: user.id,
      ipAddress: input.request.ipAddress,
      metadata: { reason: input.reason },
    });
  });
  await requestEmailDispatch(ctx.jobQueue);
}

/**
 * PR-6 / PRV-6: an account found to belong to someone under 18 is closed and its data
 * deleted at once, with no 30-day wait and no further processing. Audited.
 */
export async function deleteUnderageAccount(
  ctx: ServiceContext,
  input: {
    readonly adminUserId: string;
    readonly userId: string;
    readonly reason: string;
    readonly request: RequestInfo;
  },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const user = await requireDeletableUser(ctx.repos, input.userId);
  const now = ctx.clock.now();
  const { fileKeys } = await ctx.transaction(async (repos) => {
    await handOverBrandIfNeeded(repos, user.id);
    const { owner } = await closingScope(repos, user.id);
    if (owner) {
      await repos.privacy.closeOpenRequests(owner, now);
      await cancelDealsForClosedAccount(repos, { owner, appUrl: ctx.appUrl, now });
    }
    await repos.privacy.createRequest({
      userId: user.id,
      type: 'DELETION',
      status: 'COMPLETED',
      details: 'Under 18',
      dueAt: now,
      identityVerifiedAt: null,
      completedAt: now,
      createdAt: now,
    });
    await repos.audit.record({
      category: 'ADMIN',
      action: 'user.deleted-underage',
      actorUserId: input.adminUserId,
      subjectUserId: user.id,
      ipAddress: input.request.ipAddress,
      metadata: { reason: input.reason },
    });
    return repos.privacy.anonymiseUser(user.id);
  });
  for (const key of fileKeys) await ctx.fileStorage.delete(key);
  await requestEmailDispatch(ctx.jobQueue);
}

/** PRV-4: daily job that anonymises accounts whose 30 days have passed. */
export async function finaliseDeletions(
  deps: Pick<ServiceContext, 'repos' | 'transaction' | 'clock' | 'fileStorage'>,
): Promise<{ anonymised: number }> {
  const now = deps.clock.now();
  const due = await deps.repos.privacy.deletionsDue(now, DELETIONS_PER_RUN);
  for (const request of due) {
    const { fileKeys } = await deps.transaction(async (repos) => {
      const result = await repos.privacy.anonymiseUser(request.userId);
      await repos.privacy.closeRequest(request.id, {
        status: 'COMPLETED',
        resolution: null,
        handledByUserId: null,
        completedAt: now,
      });
      await repos.audit.record({
        category: 'DATA',
        action: 'account.anonymised',
        subjectUserId: request.userId,
      });
      return result;
    });
    for (const key of fileKeys) await deps.fileStorage.delete(key);
  }
  return { anonymised: due.length };
}

/** UC-M4: privacy requests by status; open ones by due date. */
export async function listDataRequests(
  ctx: ServiceContext,
  input: {
    readonly adminUserId: string;
    readonly status: DataRequestStatus;
    readonly page: number;
  },
): Promise<{
  items: readonly (DataRequestRecord & { readonly isOverdue: boolean })[];
  page: number;
  pageCount: number;
}> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const page = Math.max(1, Math.floor(input.page));
  const result = await ctx.repos.privacy.listRequests(input.status, {
    offset: (page - 1) * QUEUE_PAGE_SIZE,
    limit: QUEUE_PAGE_SIZE,
  });
  const now = ctx.clock.now();
  return {
    items: result.items.map((item) => ({
      ...item,
      isOverdue: item.status === 'OPEN' && item.dueAt <= now,
    })),
    page,
    pageCount: Math.max(1, Math.ceil(result.total / QUEUE_PAGE_SIZE)),
  };
}

/**
 * UC-M4: an admin completes or rejects a correction request with an answer. Deletions
 * finish on their own after 30 days. Audited.
 */
export async function closeDataRequest(
  ctx: ServiceContext,
  input: {
    readonly adminUserId: string;
    readonly requestId: string;
    readonly outcome: 'COMPLETED' | 'REJECTED';
    readonly resolution: string;
    readonly request: RequestInfo;
  },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const dataRequest = await ctx.repos.privacy.findRequest(input.requestId);
  if (!dataRequest) throw notFound();
  if (dataRequest.type !== 'CORRECTION') throw invalidState();
  await ctx.transaction(async (repos) => {
    const isClosed = await repos.privacy.closeRequest(dataRequest.id, {
      status: input.outcome,
      resolution: input.resolution,
      handledByUserId: input.adminUserId,
      completedAt: ctx.clock.now(),
    });
    if (!isClosed) throw invalidState();
    await repos.audit.record({
      category: 'ADMIN',
      action: `data-request.${input.outcome.toLowerCase()}`,
      actorUserId: input.adminUserId,
      subjectUserId: dataRequest.userId,
      ipAddress: input.request.ipAddress,
      metadata: { requestId: dataRequest.id },
    });
  });
}
