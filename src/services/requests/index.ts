/** Requests module: collaboration requests from brands to creators (FR-7, UC-R1, UC-R2). */
import type { BrandMembership } from '@/adapters/db/brand-repository';
import type { CreatorProfileRecord } from '@/adapters/db/creator-repository';
import type { Repositories } from '@/adapters/db/repositories';
import type {
  EditableRequestFields,
  RequestRecord,
  RequestSummary,
} from '@/adapters/db/request-repository';
import {
  COLLABORATION_PAGE_SIZE,
  REQUEST_EXPIRY_DAYS,
  REQUEST_LIMITS,
} from '@/config/collaboration';
import { containsProfanity } from '@/domain/content-safety';
import {
  conflict,
  invalidState,
  notAllowed,
  notAvailable,
  notFound,
  planLimitReached,
  requestExpired,
  validationFailed,
} from '@/domain/errors';
import {
  type CollabRequestStatus,
  contactPeriodStart,
  type DeliverableLine,
  effectiveRequestStatus,
  openPairKey,
  requestExpiresAt,
  type UsageRights,
} from '@/domain/requests';
import { getLogger } from '@/lib/logger';
import { openChatThread } from '../chat';
import type { ServiceContext } from '../context';
import { createDealFromRequest } from '../deals';
import { requireBrandMembership } from '../discovery';
import { requestEmailDispatch } from '../email';
import { brandContactIds, notifyUsers } from '../notifications';
import { consumeRateLimit, recordSecurityEvent } from '../security';

export type { RequestSummary } from '@/adapters/db/request-repository';

const PAISE_PER_RUPEE = 100;
const DAY_MS = 86_400_000;
const logger = getLogger('requests');

/** The creator profile of a creator account; NOT_ALLOWED for anyone else (SR-5). */
async function requireCreatorProfile(
  repos: Repositories,
  userId: string,
): Promise<CreatorProfileRecord> {
  const profile = await repos.creators.findByUserId(userId);
  if (!profile) throw notAllowed();
  return profile;
}

/** SEC-2: someone else's request looks like it doesn't exist, and the attempt is logged. */
async function deniedAsNotFound(repos: Repositories, userId: string): Promise<never> {
  await recordSecurityEvent(repos, {
    action: 'access.denied',
    actorUserId: userId,
    metadata: { resource: 'request' },
  });
  throw notFound();
}

export interface RequestInput {
  readonly campaignName: string;
  readonly brief: string;
  readonly deliverables: readonly DeliverableLine[];
  readonly budgetRupees: number | null;
  /** Calendar date, "YYYY-MM-DD". */
  readonly deadline: string;
  readonly usageRights: UsageRights;
}

/** Checks the rules a form schema can't (dates against the clock, wording). */
function checkedFields(
  input: RequestInput,
  now: Date,
): Omit<EditableRequestFields, 'campaignId'> & { campaignName: string } {
  const deadline = new Date(`${input.deadline}T00:00:00Z`);
  const today = new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
  const latest = new Date(today.getTime() + REQUEST_LIMITS.maxDeadlineDays * DAY_MS);
  if (Number.isNaN(deadline.getTime()) || deadline <= today || deadline > latest) {
    throw validationFailed({ deadline: 'request.invalidDeadline' });
  }
  if (containsProfanity(input.brief) || containsProfanity(input.campaignName)) {
    throw validationFailed({ brief: 'profile.noProfanity' });
  }
  return {
    campaignName: input.campaignName,
    brief: input.brief,
    deliverables: input.deliverables,
    budgetMinor: input.budgetRupees === null ? null : input.budgetRupees * PAISE_PER_RUPEE,
    deadline,
    usageRights: input.usageRights,
  };
}

/** Budgets are in the country's currency (NFR-8, multi-country via CountrySettings). */
async function currencyOf(repos: Repositories, countryCode: string): Promise<string> {
  const country = await repos.reference.findCountry(countryCode);
  if (!country) throw new Error(`Unknown country ${countryCode}`);
  return country.currencyCode;
}

export interface RequestAllowance {
  readonly used: number;
  readonly limit: number;
  readonly remaining: number;
}

async function allowanceFor(
  repos: Repositories,
  membership: BrandMembership,
  now: Date,
): Promise<RequestAllowance> {
  const since = contactPeriodStart(membership.plan.billingPeriod, membership.planStartedAt, now);
  const used = await repos.requests.countSentSince(membership.brandId, since);
  const limit = membership.plan.contactRequestsPerPeriod;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export interface RequestFormContext {
  readonly allowance: RequestAllowance;
  /** Campaign names the brand used before, offered as suggestions. */
  readonly campaignNames: readonly string[];
  /** Earliest deadline the form accepts, "YYYY-MM-DD" (tomorrow, UTC). */
  readonly minDeadline: string;
}

/** What the request form needs: the plan allowance, past campaigns and the date range. */
export async function getRequestFormContext(
  ctx: ServiceContext,
  userId: string,
): Promise<RequestFormContext> {
  const membership = await requireBrandMembership(ctx.repos, userId);
  const now = ctx.clock.now();
  const tomorrow = new Date((Math.floor(now.getTime() / DAY_MS) + 1) * DAY_MS);
  return {
    allowance: await allowanceFor(ctx.repos, membership, now),
    campaignNames: await ctx.repos.requests.listCampaignNames(membership.brandId),
    minDeadline: tomorrow.toISOString().slice(0, 10),
  };
}

/** UC-R1: the creator a new request is for, or null when they can't be found by this brand. */
export async function findRequestTarget(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly slug: string },
): Promise<{ id: string; displayName: string; slug: string; isOpen: boolean } | null> {
  const membership = await requireBrandMembership(ctx.repos, input.userId);
  const creator = await ctx.repos.creators.findBySlug(input.slug);
  if (!creator?.isSearchable || creator.countryCode !== membership.countryCode) return null;
  return {
    id: creator.id,
    displayName: creator.displayName,
    slug: creator.slug,
    isOpen: creator.isOpenToCollaborations,
  };
}

/**
 * FR-7.1 / UC-R1: sends a request. It counts against the plan (checked under a lock on the
 * brand, so parallel sends can't overshoot); a creator who isn't open or has blocked the
 * brand is "not available" (the same answer for both); a second open request to the same
 * creator is a CONFLICT. The creator is emailed.
 */
export async function sendRequest(
  ctx: ServiceContext,
  input: RequestInput & { readonly userId: string; readonly creatorId: string },
): Promise<string> {
  const now = ctx.clock.now();
  await consumeRateLimit(ctx.repos, now, 'requestsPerUser', input.userId);
  const membership = await requireBrandMembership(ctx.repos, input.userId);
  const fields = checkedFields(input, now);

  const requestId = await ctx.transaction(async (repos) => {
    await repos.brands.lockForUpdate(membership.brandId);
    const allowance = await allowanceFor(repos, membership, now);
    if (allowance.remaining === 0) throw planLimitReached();

    const creator = await repos.creators.findById(input.creatorId);
    if (!creator || !creator.isSearchable || creator.countryCode !== membership.countryCode) {
      throw notFound();
    }
    const creatorUser = await repos.users.findById(creator.userId);
    if (
      !creator.isOpenToCollaborations ||
      creatorUser?.status !== 'ACTIVE' ||
      (await repos.requests.isBlockedEitherWay(creator.id, membership.brandId))
    ) {
      throw notAvailable();
    }
    const pairKey = openPairKey(membership.brandId, creator.id);
    if (await repos.requests.hasOpenRequest(pairKey)) throw conflict();

    const { campaignName, ...rest } = fields;
    const id = await repos.requests.create({
      ...rest,
      campaignId: await repos.requests.campaignIdFor(membership.brandId, campaignName),
      brandId: membership.brandId,
      creatorId: creator.id,
      sentByUserId: input.userId,
      currencyCode: await currencyOf(repos, membership.countryCode),
      openPairKey: pairKey,
      expiresAt: requestExpiresAt(now, REQUEST_EXPIRY_DAYS),
      createdAt: now,
    });
    await notifyUsers(repos, ctx.appUrl, {
      userIds: [creator.userId],
      path: `/creator/requests/${id}`,
      email: (recipient) => ({
        template: 'requestReceived',
        payload: { ...recipient, brandName: membership.brandName, campaignName },
      }),
    });
    return id;
  });
  await requestEmailDispatch(ctx.jobQueue);
  logger.info({ action: 'request.sent', requestId }, 'collaboration request sent');
  return requestId;
}

/** The request, if it belongs to the user's brand; otherwise "not found" (SEC-2). */
async function requireBrandRequest(
  repos: Repositories,
  userId: string,
  requestId: string,
): Promise<{ membership: BrandMembership; request: RequestRecord }> {
  const membership = await requireBrandMembership(repos, userId);
  const request = await repos.requests.findById(requestId);
  if (!request || request.brandId !== membership.brandId) return deniedAsNotFound(repos, userId);
  return { membership, request };
}

function assertOpen(request: RequestRecord, now: Date): void {
  if (effectiveRequestStatus(request, now) === 'EXPIRED') throw requestExpired();
  if (request.status !== 'OPEN') throw invalidState();
}

/** UC-R2: the brand edits an open request; the creator then sees (and answers) the new version. */
export async function updateRequest(
  ctx: ServiceContext,
  input: RequestInput & { readonly userId: string; readonly requestId: string },
): Promise<void> {
  const now = ctx.clock.now();
  const { membership, request } = await requireBrandRequest(
    ctx.repos,
    input.userId,
    input.requestId,
  );
  assertOpen(request, now);
  const { campaignName, ...fields } = checkedFields(input, now);
  await ctx.transaction(async (repos) => {
    const campaignId = await repos.requests.campaignIdFor(membership.brandId, campaignName);
    if (!(await repos.requests.updateOpen(request.id, { ...fields, campaignId }))) {
      throw invalidState();
    }
  });
}

/** FR-7.2: the brand withdraws an open request. It still counts against the plan. */
export async function withdrawRequest(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly requestId: string },
): Promise<void> {
  const now = ctx.clock.now();
  const { request } = await requireBrandRequest(ctx.repos, input.userId, input.requestId);
  assertOpen(request, now);
  const isClosed = await ctx.repos.requests.closeOpen(request.id, {
    status: 'WITHDRAWN',
    respondedAt: now,
  });
  if (!isClosed) throw invalidState();
}

/**
 * FR-7.2 / UC-R2: the creator accepts or declines (with an optional reason). Expired
 * requests can't be answered; if the brand changed the request after the creator opened
 * it, the answer is refused (CONFLICT) so they review the latest version first. A brand
 * with no active members left is "not available". The brand is emailed.
 */
export async function respondToRequest(
  ctx: ServiceContext,
  input: {
    readonly userId: string;
    readonly requestId: string;
    readonly version: number;
    readonly decision: 'accept' | 'decline';
    readonly reason?: string;
  },
): Promise<void> {
  const now = ctx.clock.now();
  const creator = await requireCreatorProfile(ctx.repos, input.userId);
  const request = await ctx.repos.requests.findById(input.requestId);
  if (!request || request.creatorId !== creator.id) {
    return deniedAsNotFound(ctx.repos, input.userId);
  }
  assertOpen(request, now);
  if (request.version !== input.version) throw conflict();
  const recipients = await brandContactIds(ctx.repos, request.brandId, request.sentByUserId);
  if (input.decision === 'accept' && recipients.length === 0) throw notAvailable();

  const isAccepted = input.decision === 'accept';
  await ctx.transaction(async (repos) => {
    const isClosed = await repos.requests.closeOpen(request.id, {
      status: isAccepted ? 'ACCEPTED' : 'DECLINED',
      respondedAt: now,
      expectedVersion: input.version,
      declineReason: isAccepted ? null : input.reason?.trim() || null,
    });
    if (!isClosed) throw conflict();
    let dealId: string | null = null;
    if (isAccepted) {
      await openChatThread(repos, request, now);
      dealId = await createDealFromRequest(repos, request, now);
    }
    await notifyUsers(repos, ctx.appUrl, {
      userIds: recipients,
      path: isAccepted ? `/deals/${dealId}` : `/brand/requests/${request.id}`,
      email: (recipient) => {
        const payload = {
          ...recipient,
          creatorName: creator.displayName,
          campaignName: request.campaignName,
        };
        return isAccepted
          ? { template: 'requestAccepted', payload }
          : { template: 'requestDeclined', payload };
      },
    });
  });
  await requestEmailDispatch(ctx.jobQueue);
  logger.info({ action: `request.${input.decision}`, requestId: request.id }, 'request answered');
}

export interface RequestView extends RequestRecord {
  readonly viewerSide: 'BRAND' | 'CREATOR';
  readonly brand: {
    readonly name: string;
    readonly industry: string;
    readonly website: string | null;
  };
  /** True when the viewer's side has blocked the other side. */
  readonly isBlockedByViewer: boolean;
  readonly canEdit: boolean;
  readonly canRespond: boolean;
  /** The chat and deal opened when the request was accepted. */
  readonly chatId: string | null;
  readonly dealId: string | null;
}

/**
 * One request, for the brand that sent it or the creator it was sent to. Anyone else
 * gets "not found", and the attempt is logged (SR-5, SEC-2).
 */
export async function getRequest(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly requestId: string },
): Promise<RequestView> {
  const now = ctx.clock.now();
  const request = await ctx.repos.requests.findById(input.requestId);
  if (!request) return deniedAsNotFound(ctx.repos, input.userId);

  let viewerSide: RequestView['viewerSide'];
  if (request.creatorUserId === input.userId) {
    viewerSide = 'CREATOR';
  } else {
    const membership = await ctx.repos.brands.findMembership(input.userId);
    if (membership?.brandId !== request.brandId) return deniedAsNotFound(ctx.repos, input.userId);
    viewerSide = 'BRAND';
  }
  const brand = await ctx.repos.brands.findPublicDetails(request.brandId);
  const status: CollabRequestStatus = effectiveRequestStatus(request, now);
  return {
    ...request,
    status,
    viewerSide,
    brand: {
      name: brand?.name ?? '',
      industry: brand?.industry ?? '',
      website: brand?.website ?? null,
    },
    isBlockedByViewer: await ctx.repos.requests.hasBlocked(
      request.creatorId,
      request.brandId,
      viewerSide,
    ),
    canEdit: viewerSide === 'BRAND' && status === 'OPEN',
    canRespond: viewerSide === 'CREATOR' && status === 'OPEN',
    chatId: await ctx.repos.chat.findThreadIdForRequest(request.id),
    dealId: await ctx.repos.deals.findIdForRequest(request.id),
  };
}

export interface RequestListPage {
  readonly items: readonly RequestSummary[];
  readonly page: number;
  readonly pageCount: number;
}

function pageOffset(page: number): { page: number; offset: number; limit: number } {
  const safePage = Math.max(1, Math.floor(page));
  return {
    page: safePage,
    offset: (safePage - 1) * COLLABORATION_PAGE_SIZE,
    limit: COLLABORATION_PAGE_SIZE,
  };
}

function toListPage(
  result: { items: RequestSummary[]; total: number },
  page: number,
  now: Date,
): RequestListPage {
  return {
    items: result.items.map((item) => ({ ...item, status: effectiveRequestStatus(item, now) })),
    page,
    pageCount: Math.max(1, Math.ceil(result.total / COLLABORATION_PAGE_SIZE)),
  };
}

/** UC-R1: requests the user's brand has sent, newest first. */
export async function listBrandRequests(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly page: number },
): Promise<RequestListPage> {
  const membership = await requireBrandMembership(ctx.repos, input.userId);
  const { page, ...range } = pageOffset(input.page);
  const result = await ctx.repos.requests.listForBrand(membership.brandId, range);
  return toListPage(result, page, ctx.clock.now());
}

/** UC-R2: the creator's request inbox, open requests first. */
export async function listCreatorRequests(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly page: number },
): Promise<RequestListPage> {
  const creator = await requireCreatorProfile(ctx.repos, input.userId);
  const { page, ...range } = pageOffset(input.page);
  const result = await ctx.repos.requests.listForCreator(creator.id, range);
  return toListPage(result, page, ctx.clock.now());
}

/** How many requests wait for the creator's answer (for the navigation badge). */
export async function countOpenRequests(ctx: ServiceContext, userId: string): Promise<number> {
  const creator = await ctx.repos.creators.findByUserId(userId);
  return creator ? ctx.repos.requests.countOpenForCreator(creator.id, ctx.clock.now()) : 0;
}

/**
 * FR-8.3 / SEC-6: blocks the other side of a request. A creator blocking a brand also
 * declines its open requests; neither side can then send requests or messages. Only
 * someone you have a request with can be blocked.
 */
export async function setBlocked(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly requestId: string; readonly isBlocked: boolean },
): Promise<void> {
  const view = await getRequest(ctx, input);
  const now = ctx.clock.now();
  await ctx.transaction(async (repos) => {
    if (!input.isBlocked) {
      await repos.requests.removeBlock(view.creatorId, view.brandId, view.viewerSide);
      return;
    }
    await repos.requests.addBlock(view.creatorId, view.brandId, view.viewerSide);
    await repos.requests.declineOpenBetween(view.creatorId, view.brandId, now);
  });
  logger.info(
    { action: input.isBlocked ? 'block.added' : 'block.removed', side: view.viewerSide },
    'block changed',
  );
}

/** FR-7.2: hourly job that expires unanswered requests. */
export async function expireRequests(
  deps: Pick<ServiceContext, 'repos' | 'clock'>,
): Promise<{ expired: number }> {
  return { expired: await deps.repos.requests.expireDue(deps.clock.now()) };
}
