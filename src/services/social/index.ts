/** Social module: connect, disconnect and refresh YouTube/Instagram accounts (FR-3, UC-C2..C5). */
import type { Repositories } from '@/adapters/db/repositories';
import type { SocialAccountStatus } from '@/adapters/db/social-account-repository';
import {
  type PlatformAccount,
  type PostStats,
  type ProviderTokens,
  type SocialPlatform,
  SocialProviderError,
} from '@/adapters/social/provider';
import { PENDING_SOCIAL_CONNECTION_TTL_MS, SOCIAL_REFRESH } from '@/config/creators';
import { JOB_NAMES } from '@/config/jobs';
import { invalidLink, notAllowed, notFound, validationFailed } from '@/domain/errors';
import { getLogger } from '@/lib/logger';
import type { ServiceContext } from '../context';
import { requestEmailDispatch } from '../email';
import { notifyUsers } from '../notifications';
import { recomputeCreatorScore } from '../scoring';
import { recordSecurityEvent } from '../security';

const logger = getLogger('social');

export type ConnectionOutcome =
  | { readonly kind: 'connected'; readonly accountId: string }
  /** UC-C2: the login controls several channels; the creator picks one. */
  | { readonly kind: 'choose-account'; readonly pendingId: string }
  /** UC-C2/C3: another creator already claimed it; an admin decides (UC-M3). */
  | { readonly kind: 'disputed' }
  /** UC-C3: Instagram personal account; must switch to Creator or Business. */
  | { readonly kind: 'personal-account' }
  | { readonly kind: 'no-accounts' };

async function requireCreatorProfileId(repos: Repositories, userId: string): Promise<string> {
  const profile = await repos.creators.findByUserId(userId);
  if (!profile) throw notAllowed();
  return profile.id;
}

/** Asks the worker to refresh one account soon. */
async function requestRefresh(ctx: ServiceContext, accountId: string): Promise<void> {
  await ctx.jobQueue.enqueue(JOB_NAMES.refreshSocialAccount, { accountId });
}

/** FR-3.1/3.2: the official login URL that proves ownership. */
export function buildConnectionUrl(
  ctx: ServiceContext,
  input: { platform: SocialPlatform; state: string; redirectUri: string },
): string {
  return ctx.socialProviders[input.platform].authorizationUrl(input);
}

/**
 * Links one platform account to a creator. A new account is created (verified when tokens
 * prove ownership); an unverified link of the same creator is upgraded; another creator's
 * claim opens a dispute instead (SEC-4).
 */
async function attachAccount(
  ctx: ServiceContext,
  input: {
    userId: string;
    platform: SocialPlatform;
    account: PlatformAccount;
    tokens: ProviderTokens | null;
  },
): Promise<ConnectionOutcome> {
  const now = ctx.clock.now();
  const encrypted = input.tokens
    ? {
        accessTokenEncrypted: ctx.tokenCipher.encrypt(input.tokens.accessToken),
        refreshTokenEncrypted: input.tokens.refreshToken
          ? ctx.tokenCipher.encrypt(input.tokens.refreshToken)
          : null,
        tokenExpiresAt: input.tokens.expiresAt,
      }
    : null;

  const outcome = await ctx.transaction(async (repos): Promise<ConnectionOutcome> => {
    const creatorId = await requireCreatorProfileId(repos, input.userId);
    const claim = await repos.socialAccounts.findClaim(input.platform, input.account.externalId);

    if (claim && claim.creatorId !== creatorId) {
      await repos.socialAccounts.createDispute({
        socialAccountId: claim.id,
        claimantUserId: input.userId,
        isClaimVerified: encrypted !== null,
      });
      await recordSecurityEvent(repos, {
        action: 'social.claim-disputed',
        actorUserId: input.userId,
        metadata: { platform: input.platform, isClaimVerified: encrypted !== null },
      });
      return { kind: 'disputed' };
    }
    if (claim) {
      if (encrypted && !claim.isVerified) {
        await repos.socialAccounts.markVerified(claim.id, encrypted, now);
      }
      return { kind: 'connected', accountId: claim.id };
    }
    const accountId = await repos.socialAccounts.create({
      creatorId,
      platform: input.platform,
      externalId: input.account.externalId,
      handle: input.account.handle,
      displayName: input.account.displayName,
      isVerified: encrypted !== null,
      verifiedAt: encrypted ? now : null,
      accessTokenEncrypted: encrypted?.accessTokenEncrypted ?? null,
      refreshTokenEncrypted: encrypted?.refreshTokenEncrypted ?? null,
      tokenExpiresAt: encrypted?.tokenExpiresAt ?? null,
    });
    await recordSecurityEvent(repos, {
      action: 'social.connected',
      actorUserId: input.userId,
      metadata: { platform: input.platform, isVerified: encrypted !== null },
    });
    return { kind: 'connected', accountId };
  });

  if (outcome.kind === 'connected') await requestRefresh(ctx, outcome.accountId);
  return outcome;
}

/**
 * FR-3.1/3.2: finishes the official login. One account connects straight away; several
 * (UC-C2) wait, encrypted, for the creator to choose.
 */
export async function completeConnection(
  ctx: ServiceContext,
  input: { userId: string; platform: SocialPlatform; code: string; redirectUri: string },
): Promise<ConnectionOutcome> {
  let result: Awaited<
    ReturnType<ServiceContext['socialProviders']['YOUTUBE']['completeAuthorization']>
  >;
  try {
    result = await ctx.socialProviders[input.platform].completeAuthorization(input);
  } catch (error) {
    if (error instanceof SocialProviderError && error.kind === 'PERSONAL_ACCOUNT') {
      return { kind: 'personal-account' };
    }
    throw error;
  }
  const [only, ...others] = result.accounts;
  if (!only) return { kind: 'no-accounts' };
  if (others.length === 0) {
    return attachAccount(ctx, { ...input, account: only, tokens: result.tokens });
  }
  const pendingId = await ctx.repos.socialAccounts.createPending({
    userId: input.userId,
    platform: input.platform,
    accessTokenEncrypted: ctx.tokenCipher.encrypt(result.tokens.accessToken),
    refreshTokenEncrypted: result.tokens.refreshToken
      ? ctx.tokenCipher.encrypt(result.tokens.refreshToken)
      : null,
    tokenExpiresAt: result.tokens.expiresAt,
    accounts: result.accounts,
    expiresAt: new Date(ctx.clock.now().getTime() + PENDING_SOCIAL_CONNECTION_TTL_MS),
  });
  return { kind: 'choose-account', pendingId };
}

/** The accounts waiting for the creator's choice (UC-C2), or null if expired. */
export async function getPendingChoices(
  ctx: ServiceContext,
  input: { userId: string; pendingId: string },
): Promise<{ platform: SocialPlatform; accounts: readonly PlatformAccount[] } | null> {
  const pending = await ctx.repos.socialAccounts.findPending(
    input.pendingId,
    input.userId,
    ctx.clock.now(),
  );
  return pending ? { platform: pending.platform, accounts: pending.accounts } : null;
}

/** UC-C2: connects the channel the creator picked from a multi-channel login. */
export async function choosePendingAccount(
  ctx: ServiceContext,
  input: { userId: string; pendingId: string; externalId: string },
): Promise<ConnectionOutcome> {
  const pending = await ctx.repos.socialAccounts.findPending(
    input.pendingId,
    input.userId,
    ctx.clock.now(),
  );
  if (!pending) throw invalidLink();
  const account = pending.accounts.find((candidate) => candidate.externalId === input.externalId);
  if (!account) throw notFound();
  await ctx.repos.socialAccounts.deletePending(pending.id);
  return attachAccount(ctx, {
    userId: input.userId,
    platform: pending.platform,
    account,
    tokens: {
      accessToken: ctx.tokenCipher.decrypt(pending.accessTokenEncrypted),
      refreshToken: pending.refreshTokenEncrypted
        ? ctx.tokenCipher.decrypt(pending.refreshTokenEncrypted)
        : null,
      expiresAt: pending.tokenExpiresAt,
    },
  });
}

/**
 * FR-3.1: links a YouTube channel by URL or id using public data only. The link stays
 * unverified (no badge, FR-3.3) until the creator signs in with Google.
 */
export async function connectPublicChannel(
  ctx: ServiceContext,
  input: { userId: string; channelUrlOrId: string },
): Promise<ConnectionOutcome> {
  const account = await ctx.socialProviders.YOUTUBE.findPublicAccount(input.channelUrlOrId);
  if (!account) throw validationFailed({ channelUrlOrId: 'social.channelNotFound' });
  return attachAccount(ctx, { userId: input.userId, platform: 'YOUTUBE', account, tokens: null });
}

/**
 * UC-C5 / PRV-7: disconnects an account: tokens, snapshots and audience data are deleted
 * (PR-14), and the profile leaves search if no account is left.
 */
export async function disconnectAccount(
  ctx: ServiceContext,
  input: { userId: string; accountId: string },
): Promise<void> {
  const creatorId = await ctx.transaction(async (repos) => {
    const profileId = await requireCreatorProfileId(repos, input.userId);
    if (!(await repos.socialAccounts.deleteOwned(profileId, input.accountId))) throw notFound();
    await recordSecurityEvent(repos, {
      action: 'social.disconnected',
      actorUserId: input.userId,
    });
    return profileId;
  });
  await recomputeCreatorScore(ctx, creatorId);
}

export type RefreshOutcome =
  | 'refreshed'
  | 'quota-exceeded'
  | 'token-revoked'
  | 'account-private'
  | 'account-deleted'
  | 'failed'
  | 'skipped';

const STATUS_FOR_ERROR: Partial<Record<SocialProviderError['kind'], SocialAccountStatus>> = {
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  ACCOUNT_PRIVATE: 'PRIVATE',
  ACCOUNT_NOT_FOUND: 'DELETED',
};

const OUTCOME_FOR_STATUS: Record<SocialAccountStatus, RefreshOutcome> = {
  ACTIVE: 'failed',
  TOKEN_REVOKED: 'token-revoked',
  PRIVATE: 'account-private',
  DELETED: 'account-deleted',
};

async function freshAccessToken(
  ctx: ServiceContext,
  account: NonNullable<Awaited<ReturnType<Repositories['socialAccounts']['findForRefresh']>>>,
): Promise<string | null> {
  if (!account.accessTokenEncrypted) return null;
  const tokens: ProviderTokens = {
    accessToken: ctx.tokenCipher.decrypt(account.accessTokenEncrypted),
    refreshToken: account.refreshTokenEncrypted
      ? ctx.tokenCipher.decrypt(account.refreshTokenEncrypted)
      : null,
    expiresAt: account.tokenExpiresAt,
  };
  const refreshDue =
    tokens.expiresAt !== null &&
    tokens.expiresAt.getTime() - ctx.clock.now().getTime() < SOCIAL_REFRESH.tokenRefreshMarginMs;
  if (!refreshDue) return tokens.accessToken;
  const renewed = await ctx.socialProviders[account.platform].refreshTokens(tokens);
  await ctx.repos.socialAccounts.updateTokens(account.id, {
    accessTokenEncrypted: ctx.tokenCipher.encrypt(renewed.accessToken),
    refreshTokenEncrypted: renewed.refreshToken
      ? ctx.tokenCipher.encrypt(renewed.refreshToken)
      : null,
    tokenExpiresAt: renewed.expiresAt,
  });
  return renewed.accessToken;
}

/** Tells the creator their account needs attention (FR-12.1 data refresh failure). */
async function notifyRefreshProblem(
  ctx: ServiceContext,
  creatorId: string,
  platform: SocialPlatform,
): Promise<void> {
  const profile = await ctx.repos.creators.findById(creatorId);
  if (!profile) return;
  await notifyUsers(ctx.repos, ctx.appUrl, {
    now: ctx.clock.now(),
    userIds: [profile.userId],
    path: '/creator/accounts',
    email: (recipient) => ({
      template: 'socialRefreshFailed',
      payload: { ...recipient, platform: platform === 'YOUTUBE' ? 'YouTube' : 'Instagram' },
    }),
  });
  await requestEmailDispatch(ctx.jobQueue);
}

/**
 * UC-C4: refreshes one account: saves today's snapshot and audience, then recomputes the
 * score. Quota errors retry in the next window keeping old data; revoked tokens, private
 * and deleted accounts change status (hiding the creator from search if nothing active is
 * left) and the creator is emailed. Temporary errors are rethrown for the queue's back-off.
 */
export async function refreshSocialAccount(
  ctx: ServiceContext,
  accountId: string,
): Promise<RefreshOutcome> {
  const account = await ctx.repos.socialAccounts.findForRefresh(accountId);
  if (!account || account.status !== 'ACTIVE') return 'skipped';
  const now = ctx.clock.now();
  try {
    const accessToken = await freshAccessToken(ctx, account);
    const stats = await ctx.socialProviders[account.platform].fetchStats({
      externalId: account.externalId,
      accessToken,
      now,
    });
    await ctx.transaction(async (repos) => {
      await repos.socialAccounts.upsertSnapshot(account.id, now, stats);
      if (stats.audience)
        await repos.socialAccounts.replaceAudience(account.id, stats.audience, now);
      await repos.socialAccounts.recordRefreshSuccess(account.id, {
        handle: stats.handle,
        displayName: stats.displayName,
        isFollowerCountHidden: stats.isFollowerCountHidden,
        at: now,
      });
    });
    await recomputeCreatorScore(ctx, account.creatorId);
    return 'refreshed';
  } catch (error) {
    if (!(error instanceof SocialProviderError) || error.kind === 'TRANSIENT') throw error;
    logger.warn({ action: 'social.refresh-failed', kind: error.kind, accountId }, 'refresh failed');

    if (error.kind === 'QUOTA_EXCEEDED') {
      await ctx.repos.socialAccounts.recordRefreshFailure(account.id, {
        status: 'ACTIVE',
        error: error.kind,
        nextRefreshAt: new Date(now.getTime() + SOCIAL_REFRESH.quotaRetryDelayMs),
      });
      return 'quota-exceeded';
    }
    const status = STATUS_FOR_ERROR[error.kind] ?? 'ACTIVE';
    await ctx.repos.socialAccounts.recordRefreshFailure(account.id, {
      status,
      error: error.kind,
      nextRefreshAt:
        status === 'ACTIVE' ? new Date(now.getTime() + SOCIAL_REFRESH.quotaRetryDelayMs) : null,
    });
    if (status !== 'ACTIVE') {
      await recomputeCreatorScore(ctx, account.creatorId);
      await notifyRefreshProblem(ctx, account.creatorId, account.platform);
    }
    return OUTCOME_FOR_STATUS[status];
  }
}

const REFRESH_BATCH_SIZE = 5_000;

/** NFR-3: queues a refresh for every account not refreshed in the last 20 hours. */
export async function queueDueRefreshes(ctx: ServiceContext): Promise<{ queued: number }> {
  const now = ctx.clock.now();
  const ids = await ctx.repos.socialAccounts.listDueForRefresh(
    now,
    new Date(now.getTime() - SOCIAL_REFRESH.minIntervalMs),
    REFRESH_BATCH_SIZE,
  );
  for (const accountId of ids) await requestRefresh(ctx, accountId);
  return { queued: ids.length };
}

/**
 * UC-R6: a post's current stats, read through the account that published it (with a fresh
 * token where the platform needs one). Null when the post is gone or not on that account,
 * or the account no longer exists. Provider errors (private, quota, temporary) are thrown.
 */
export async function fetchPostStatsFor(
  ctx: ServiceContext,
  input: { readonly socialAccountId: string; readonly postId: string },
): Promise<PostStats | null> {
  const account = await ctx.repos.socialAccounts.findForRefresh(input.socialAccountId);
  if (!account || account.status !== 'ACTIVE') return null;
  return ctx.socialProviders[account.platform].fetchPostStats({
    postId: input.postId,
    accountExternalId: account.externalId,
    accessToken: await freshAccessToken(ctx, account),
  });
}

/**
 * UC-R6: which of the creator's active accounts on the platform published the post, with
 * its stats; null when none did (a link to someone else's post is rejected by the caller).
 */
export async function findCreatorPost(
  ctx: ServiceContext,
  input: { readonly creatorId: string; readonly platform: SocialPlatform; readonly postId: string },
): Promise<{ socialAccountId: string; stats: PostStats } | null> {
  for (const socialAccountId of await ctx.repos.socialAccounts.listActiveIds(
    input.creatorId,
    input.platform,
  )) {
    const stats = await fetchPostStatsFor(ctx, { socialAccountId, postId: input.postId });
    if (stats) return { socialAccountId, stats };
  }
  return null;
}

/** FR-13.2: queues an immediate refresh of every working account of a creator. */
export async function requestCreatorRefresh(
  ctx: ServiceContext,
  creatorId: string,
): Promise<number> {
  const platforms = Object.keys(ctx.socialProviders) as SocialPlatform[];
  let queued = 0;
  for (const platform of platforms) {
    for (const accountId of await ctx.repos.socialAccounts.listActiveIds(creatorId, platform)) {
      await requestRefresh(ctx, accountId);
      queued += 1;
    }
  }
  return queued;
}
