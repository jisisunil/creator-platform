import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { confirmPaymentReceived, reportPaymentNotReceived, submitContent } from '@/services/deals';
import { getRequest } from '@/services/requests';
import {
  addToShortlist,
  createShortlist,
  getShortlist,
  removeFromShortlist,
  renameShortlist,
  setShortlistShared,
} from '@/services/shortlists';
import { choosePendingAccount, disconnectAccount } from '@/services/social';
import { transferOwnership } from '@/services/team';
import { acceptedRequest } from '../integration/collaboration-fixtures';
import { createBrandOwner, createSearchableCreator } from '../integration/discovery-fixtures';
import { createTestDatabaseClient } from '../integration/test-database';
import {
  createTestContext,
  requestFrom,
  resetDatabase,
  type TestContext,
} from '../integration/test-context';

const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

/**
 * SR-5 / SEC-2: every function that takes the id of someone else's resource refuses it,
 * so changing an id in the URL never reaches another account. (The other suites cover
 * requests, chats, deals, campaigns, ratings, team, discovery and admin.)
 */
describe('remaining resources across accounts (SR-5, SEC-2)', () => {
  it('SEC-2 another brand cannot rename, share or edit a shortlist', async () => {
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const intruder = await createBrandOwner(ctx, db, 'intruder@other.in');
    const { creatorId } = await createSearchableCreator(ctx, db, { email: 'c@example.in' });
    const shortlistId = await createShortlist(ctx, { userId: owner.id, name: 'Diwali' });
    await addToShortlist(ctx, { userId: owner.id, shortlistId, creatorId });
    const itemId =
      (await getShortlist(ctx, { userId: owner.id, shortlistId })).entries[0]?.itemId ?? '';

    const attempts = [
      () => renameShortlist(ctx, { userId: intruder.id, shortlistId, name: 'Mine now' }),
      () => setShortlistShared(ctx, { userId: intruder.id, shortlistId, isShared: true }),
      () => removeFromShortlist(ctx, { userId: intruder.id, shortlistId, itemId }),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }

    const shortlist = await db.shortlist.findUniqueOrThrow({ where: { id: shortlistId } });
    expect(shortlist).toMatchObject({ name: 'Diwali', isSharedWithTeam: false });
    expect(await db.shortlistItem.count()).toBe(1);
  });

  it("SEC-2 a creator cannot disconnect another creator's account", async () => {
    const { creatorId } = await createSearchableCreator(ctx, db, { email: 'owner@example.in' });
    await createSearchableCreator(ctx, db, { email: 'intruder@example.in' });
    const intruder = await db.user.findUniqueOrThrow({ where: { email: 'intruder@example.in' } });
    const account = await db.socialAccount.findFirstOrThrow({ where: { creatorId } });

    await expect(
      disconnectAccount(ctx, { userId: intruder.id, accountId: account.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await db.socialAccount.count({ where: { id: account.id } })).toBe(1);
  });

  it("SEC-4 a creator cannot finish someone else's pending account connection", async () => {
    await createSearchableCreator(ctx, db, { email: 'owner@example.in' });
    await createSearchableCreator(ctx, db, { email: 'intruder@example.in' });
    const owner = await db.user.findUniqueOrThrow({ where: { email: 'owner@example.in' } });
    const intruder = await db.user.findUniqueOrThrow({ where: { email: 'intruder@example.in' } });
    const pendingId = await ctx.repos.socialAccounts.createPending({
      userId: owner.id,
      platform: 'YOUTUBE',
      accessTokenEncrypted: ctx.tokenCipher.encrypt('token'),
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      accounts: [{ externalId: 'mock-yt-owners-channel', handle: '@owner', displayName: 'Owner' }],
      expiresAt: new Date(ctx.clock.now().getTime() + 600_000),
    });

    await expect(
      choosePendingAccount(ctx, {
        userId: intruder.id,
        pendingId,
        externalId: 'mock-yt-owners-channel',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_LINK' });
    expect(await db.socialAccount.count({ where: { externalId: 'mock-yt-owners-channel' } })).toBe(
      0,
    );
  });

  it("SEC-2 an owner cannot hand their brand to another brand's member", async () => {
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const outsider = await createBrandOwner(ctx, db, 'outsider@other.in');

    await expect(
      transferOwnership(ctx, { ownerUserId: owner.id, newOwnerUserId: outsider.id }, requestFrom()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await db.brandMember.findUniqueOrThrow({ where: { userId: owner.id } })).role).toBe(
      'OWNER',
    );
  });

  it('SEC-2 an outsider cannot submit content or answer for a payment on a deal', async () => {
    const { brand, requestId } = await acceptedRequest(ctx, db);
    const dealId = (await getRequest(ctx, { userId: brand.id, requestId })).dealId ?? '';
    await createSearchableCreator(ctx, db, { email: 'outsider@example.in' });
    const outsider = await db.user.findUniqueOrThrow({ where: { email: 'outsider@example.in' } });

    const attempts = [
      () => submitContent(ctx, { userId: outsider.id, dealId, note: '' }),
      () => confirmPaymentReceived(ctx, { userId: outsider.id, dealId }),
      () => reportPaymentNotReceived(ctx, { userId: outsider.id, dealId, note: 'not mine' }),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
    expect((await db.deal.findUniqueOrThrow({ where: { id: dealId } })).status).toBe('ACCEPTED');
  });
});
