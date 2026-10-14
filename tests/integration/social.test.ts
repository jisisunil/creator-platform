import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SocialProviderError } from '@/adapters/social/provider';
import { getOwnProfile } from '@/services/creators';
import {
  choosePendingAccount,
  completeConnection,
  connectPublicChannel,
  disconnectAccount,
  queueDueRefreshes,
  refreshSocialAccount,
} from '@/services/social';
import { createVerifiedUser } from './accounts/fixtures';
import { createTestDatabaseClient } from './test-database';
import { createTestContext, resetDatabase, type TestContext } from './test-context';

const db = createTestDatabaseClient();
let ctx: TestContext;
const redirectUri = 'https://app.test/api/social/youtube/callback';

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

async function creator(email = 'asha@example.in') {
  const user = await createVerifiedUser(ctx, db, { email });
  await getOwnProfile(ctx, user);
  return user;
}

async function connect(
  userId: string,
  code: string,
  platform: 'YOUTUBE' | 'INSTAGRAM' = 'YOUTUBE',
) {
  return completeConnection(ctx, { userId, platform, code, redirectUri });
}

describe('connecting accounts (FR-3, UC-C2, UC-C3)', () => {
  it('FR-3.3 an official login connects a verified account with encrypted tokens', async () => {
    const user = await creator();

    const outcome = await connect(user.id, 'mock-abc123');

    expect(outcome.kind).toBe('connected');
    const account = await db.socialAccount.findFirstOrThrow();
    expect(account).toMatchObject({ isVerified: true, externalId: 'mock-yt-abc123' });
    expect(account.accessTokenEncrypted).not.toContain('mock-access');
    expect(ctx.enqueuedJobs).toContain('social.refresh-account');
  });

  it('FR-3.1 a channel linked by URL stays unverified until the official login', async () => {
    const user = await creator();

    await connectPublicChannel(ctx, { userId: user.id, channelUrlOrId: 'youtube.com/@asha' });
    const linked = await db.socialAccount.findFirstOrThrow();
    expect(linked).toMatchObject({ isVerified: false, accessTokenEncrypted: null });
  });

  it('UC-C2 SEC-4 another creator claiming the same account opens a dispute instead', async () => {
    const first = await creator();
    const second = await creator('second@example.in');
    await connect(first.id, 'mock-same1');

    const outcome = await connect(second.id, 'mock-same1');

    expect(outcome).toEqual({ kind: 'disputed' });
    expect(await db.socialAccount.count()).toBe(1);
    expect(await db.ownershipDispute.findFirstOrThrow()).toMatchObject({
      claimantUserId: second.id,
      isClaimVerified: true,
      status: 'OPEN',
    });
  });

  it('UC-C3 a personal Instagram account is explained, not connected', async () => {
    const user = await creator();

    await expect(connect(user.id, 'mock-personal', 'INSTAGRAM')).resolves.toEqual({
      kind: 'personal-account',
    });
    expect(await db.socialAccount.count()).toBe(0);
  });

  it('UC-C2 a login with several channels waits for the creator to choose', async () => {
    const user = await creator();
    const twoChannels = {
      ...ctx,
      socialProviders: {
        ...ctx.socialProviders,
        YOUTUBE: {
          ...ctx.socialProviders.YOUTUBE,
          completeAuthorization: async () => ({
            tokens: { accessToken: 'token', refreshToken: 'refresh', expiresAt: null },
            accounts: [
              { externalId: 'mock-yt-food', handle: '@food', displayName: 'Food' },
              { externalId: 'mock-yt-travel', handle: '@travel', displayName: 'Travel' },
            ],
          }),
        },
      },
    };

    const outcome = await completeConnection(twoChannels, {
      userId: user.id,
      platform: 'YOUTUBE',
      code: 'x',
      redirectUri,
    });
    expect(outcome.kind).toBe('choose-account');
    if (outcome.kind !== 'choose-account') return;

    const chosen = await choosePendingAccount(ctx, {
      userId: user.id,
      pendingId: outcome.pendingId,
      externalId: 'mock-yt-travel',
    });

    expect(chosen.kind).toBe('connected');
    expect((await db.socialAccount.findFirstOrThrow()).externalId).toBe('mock-yt-travel');
    expect(await db.pendingSocialConnection.count()).toBe(0);
  });
});

describe('refresh (FR-3.4, UC-C4)', () => {
  it('UC-C4 saves a snapshot, recomputes the score and puts the creator in search', async () => {
    const user = await creator();
    await connect(user.id, 'mock-fresh1');
    const account = await db.socialAccount.findFirstOrThrow();

    await expect(refreshSocialAccount(ctx, account.id)).resolves.toBe('refreshed');

    expect(await db.statsSnapshot.count({ where: { socialAccountId: account.id } })).toBe(1);
    const profile = await db.creatorProfile.findFirstOrThrow();
    expect(profile).toMatchObject({ isSearchable: true, isVerified: true });
    expect(profile.currentScore).toBeGreaterThan(0);
    expect(await db.scoreResult.count()).toBeGreaterThan(0);
  });

  it('UC-C4 a quota error keeps old data and retries in the next window', async () => {
    const user = await creator();
    await connect(user.id, 'mock-quota1');
    const account = await db.socialAccount.findFirstOrThrow();

    await expect(refreshSocialAccount(ctx, account.id)).resolves.toBe('quota-exceeded');

    const stored = await db.socialAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(stored.status).toBe('ACTIVE');
    expect(stored.nextRefreshAt).toEqual(new Date(ctx.clock.now().getTime() + 6 * 3_600_000));
  });

  it('UC-C4 a private account is hidden from search and the creator is told', async () => {
    const user = await creator();
    await connect(user.id, 'mock-private1');
    const account = await db.socialAccount.findFirstOrThrow();

    await expect(refreshSocialAccount(ctx, account.id)).resolves.toBe('account-private');

    expect((await db.socialAccount.findFirstOrThrow()).status).toBe('PRIVATE');
    expect((await db.creatorProfile.findFirstOrThrow()).isSearchable).toBe(false);
    expect(await db.emailOutbox.count({ where: { template: 'socialRefreshFailed' } })).toBe(1);
  });

  it('UC-C4 revoked access asks the creator to reconnect', async () => {
    const user = await creator();
    await connect(user.id, 'mock-revoked1');
    const account = await db.socialAccount.findFirstOrThrow();

    await expect(refreshSocialAccount(ctx, account.id)).resolves.toBe('token-revoked');
    expect((await db.socialAccount.findFirstOrThrow()).status).toBe('TOKEN_REVOKED');
  });

  it('UC-C4 temporary errors are rethrown so the queue retries with back-off', async () => {
    const user = await creator();
    await connect(user.id, 'mock-flaky1');
    const account = await db.socialAccount.findFirstOrThrow();

    await expect(refreshSocialAccount(ctx, account.id)).rejects.toBeInstanceOf(SocialProviderError);
  });

  it('NFR-3 queues only accounts not refreshed in the last 20 hours', async () => {
    const user = await creator();
    await connect(user.id, 'mock-due1');
    await connect(user.id, 'mock-due2', 'INSTAGRAM');
    const [first] = await db.socialAccount.findMany({ orderBy: { createdAt: 'asc' } });
    await refreshSocialAccount(ctx, first?.id ?? '');
    ctx.enqueuedJobs.length = 0;

    await expect(queueDueRefreshes(ctx)).resolves.toEqual({ queued: 1 });
  });
});

describe('disconnecting (UC-C5, PRV-7)', () => {
  it('PRV-7 deletes tokens, snapshots and audience, and removes the badge and search listing', async () => {
    const user = await creator();
    await connect(user.id, 'mock-insta1', 'INSTAGRAM');
    const account = await db.socialAccount.findFirstOrThrow();
    await refreshSocialAccount(ctx, account.id);
    expect(await db.audienceSegment.count()).toBeGreaterThan(0);

    await disconnectAccount(ctx, { userId: user.id, accountId: account.id });

    expect(await db.socialAccount.count()).toBe(0);
    expect(await db.statsSnapshot.count()).toBe(0);
    expect(await db.audienceSegment.count()).toBe(0);
    expect(await db.creatorProfile.findFirstOrThrow()).toMatchObject({
      isSearchable: false,
      isVerified: false,
    });
  });

  it("SR-5 a creator cannot disconnect someone else's account", async () => {
    const owner = await creator();
    const intruder = await creator('intruder@example.in');
    await connect(owner.id, 'mock-owned1');
    const account = await db.socialAccount.findFirstOrThrow();

    await expect(
      disconnectAccount(ctx, { userId: intruder.id, accountId: account.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await db.socialAccount.count()).toBe(1);
  });
});
