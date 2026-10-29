import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getOwnProfile, getPublicProfile } from '@/services/creators';
import { searchCreators } from '@/services/discovery';
import {
  addSelfReportedAccount,
  completeConnection,
  queueDueRefreshes,
  refreshSocialAccount,
  requestCreatorRefresh,
} from '@/services/social';
import { createVerifiedUser } from './accounts/fixtures';
import { createBrandOwner } from './discovery-fixtures';
import { createTestDatabaseClient } from './test-database';
import { createTestContext, resetDatabase, type TestContext } from './test-context';

const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

/** A creator with a complete profile and no social accounts yet. */
async function creator(email = 'asha@example.in') {
  const user = await createVerifiedUser(ctx, db, { email });
  const profile = await getOwnProfile(ctx, user);
  await ctx.repos.creators.updateFields(profile.id, {
    displayName: 'Asha Cooks',
    bio: 'Home-style Tamil recipes.',
    city: 'Chennai',
    stateCode: 'TN',
  });
  return { user, profile };
}

const addInstagram = (userId: string, handle: string, declaredFollowers: number | null = null) =>
  addSelfReportedAccount(ctx, { userId, platform: 'INSTAGRAM', handle, declaredFollowers });

describe('self-reported Instagram (Q-17, Q-43)', () => {
  it('Q-43 a listed handle makes the creator findable but stays unverified and unscored', async () => {
    const { user } = await creator();
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');

    await addInstagram(user.id, 'https://www.instagram.com/Asha.Cooks/', 12_000);

    const own = await getOwnProfile(ctx, user);
    expect(own).toMatchObject({ isSearchable: true, isVerified: false, tier: null });
    expect(own.accounts).toEqual([
      expect.objectContaining({
        platform: 'INSTAGRAM',
        handle: '@asha.cooks',
        isVerified: false,
        isSelfReported: true,
        selfReportedFollowers: 12_000,
      }),
    ]);
    const shown = await getPublicProfile(ctx, own.slug);
    expect(shown?.accounts).toEqual([
      {
        platform: 'INSTAGRAM',
        handle: '@asha.cooks',
        isVerified: false,
        isSelfReported: true,
        declaredFollowers: 12_000,
        profileUrl: 'https://www.instagram.com/asha.cooks/',
      },
    ]);
    // The declared count is display only: it never becomes the creator's follower figure.
    expect(shown?.totalFollowers).toBe(0);
    const found = await searchCreators(ctx, {
      userId: brand.id,
      filters: { platforms: ['INSTAGRAM'] },
      sort: 'score',
      page: 1,
    });
    expect(found.items.map((item) => item.slug)).toEqual([own.slug]);
  });

  it('Q-43 nothing is fetched for a self-reported account', async () => {
    const { user, profile } = await creator();
    const { accountId } = await addInstagram(user.id, '@asha.cooks');
    ctx.enqueuedJobs.length = 0;

    await expect(refreshSocialAccount(ctx, accountId)).resolves.toBe('skipped');
    await expect(queueDueRefreshes(ctx)).resolves.toEqual({ queued: 0 });
    await expect(requestCreatorRefresh(ctx, profile.id)).resolves.toBe(0);
    const health = await ctx.repos.socialAccounts.refreshHealth(new Date(Date.now() + 86_400_000));
    expect(health.stale).toBe(0);
    expect(await db.statsSnapshot.count()).toBe(0);
  });

  it('Q-43 refuses a bad handle, a bad follower count and a second Instagram account', async () => {
    const { user } = await creator();

    await expect(addInstagram(user.id, 'asha..cooks')).rejects.toMatchObject({
      fieldErrors: { handle: 'social.handleInvalid' },
    });
    await expect(addInstagram(user.id, 'asha.cooks', -5)).rejects.toMatchObject({
      fieldErrors: { declaredFollowers: 'validation.outOfRange' },
    });
    await addInstagram(user.id, 'asha.cooks');
    await expect(addInstagram(user.id, 'asha.bakes')).rejects.toMatchObject({
      fieldErrors: { handle: 'social.alreadyHasAccount' },
    });
  });

  it('SEC-4 a handle can be listed only once, whoever typed it first', async () => {
    const { user: first } = await creator('first@example.in');
    const { user: second } = await creator('second@example.in');

    await addInstagram(first.id, 'asha.cooks');

    await expect(addInstagram(second.id, '@ASHA.COOKS')).rejects.toMatchObject({
      fieldErrors: { handle: 'social.handleAlreadyListed' },
    });
  });

  it('Q-43 connecting with the official login replaces the self-reported listing', async () => {
    const { user } = await creator();
    await addInstagram(user.id, 'asha.cooks', 12_000);

    await completeConnection(ctx, {
      userId: user.id,
      platform: 'INSTAGRAM',
      code: 'mock-asha',
      redirectUri: 'https://app.test/api/social/instagram/callback',
    });

    const accounts = (await getOwnProfile(ctx, user)).accounts;
    expect(accounts).toEqual([
      expect.objectContaining({ platform: 'INSTAGRAM', isVerified: true, isSelfReported: false }),
    ]);
  });

  it('SEC-4 the real owner logging in removes someone else listing their handle', async () => {
    const { user: owner } = await creator('owner@example.in');
    const { profile: impostor } = await creator('impostor@example.in');
    // The impostor typed in the handle the owner's official login will report.
    await ctx.repos.socialAccounts.create({
      creatorId: impostor.id,
      platform: 'INSTAGRAM',
      externalId: 'self-reported:mock-ig-owner',
      handle: '@mock-ig-owner',
      displayName: '@mock-ig-owner',
      isVerified: false,
      verifiedAt: null,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      isSelfReported: true,
    });

    await completeConnection(ctx, {
      userId: owner.id,
      platform: 'INSTAGRAM',
      code: 'mock-owner',
      redirectUri: 'https://app.test/api/social/instagram/callback',
    });

    expect(await db.socialAccount.count({ where: { creatorId: impostor.id } })).toBe(0);
    expect(
      (await db.creatorProfile.findUniqueOrThrow({ where: { id: impostor.id } })).isSearchable,
    ).toBe(false);
  });
});
