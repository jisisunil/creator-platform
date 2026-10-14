import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addToShortlist,
  createShortlist,
  deleteShortlist,
  exportShortlistCsv,
  getShortlist,
  listShortlists,
  removeFromShortlist,
  renameShortlist,
  setShortlistNote,
  setShortlistShared,
} from '@/services/shortlists';
import { acceptInviteWithNewAccount, inviteTeamMember } from '@/services/team';
import { createBrandOwner, createSearchableCreator } from './discovery-fixtures';
import { createTestDatabaseClient } from './test-database';
import {
  createTestContext,
  latestEmailLink,
  requestFrom,
  resetDatabase,
  STRONG_PASSWORD,
  type TestContext,
  tokenFromLink,
} from './test-context';

const db = createTestDatabaseClient();
let ctx: TestContext;

const labels = {
  headers: [
    'name',
    'profile',
    'city',
    'state',
    'categories',
    'platforms',
    'tier',
    'followers',
    'engagement',
    'score',
    'verified',
    'note',
  ],
  yes: 'yes',
  no: 'no',
};

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

async function teamMember(ownerId: string, email: string): Promise<string> {
  await inviteTeamMember(ctx, { ownerUserId: ownerId, email }, requestFrom());
  const token = tokenFromLink(await latestEmailLink(db, 'teamInvite', email));
  const joined = await acceptInviteWithNewAccount(
    ctx,
    { token, name: 'Member', password: STRONG_PASSWORD, acceptsMarketing: false },
    requestFrom(),
  );
  return joined.userId;
}

describe('shortlists (FR-6.1, UC-D3)', () => {
  it('FR-6.1 creates a list, adds creators with notes, and ignores duplicates', async () => {
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const { creatorId } = await createSearchableCreator(ctx, db, {
      email: 'c@example.in',
      displayName: 'Asha',
    });
    const shortlistId = await createShortlist(ctx, { userId: owner.id, name: 'Diwali campaign' });

    await expect(
      addToShortlist(ctx, { userId: owner.id, shortlistId, creatorId }),
    ).resolves.toEqual({ wasAdded: true });
    await expect(
      addToShortlist(ctx, { userId: owner.id, shortlistId, creatorId }),
    ).resolves.toEqual({ wasAdded: false });
    const [entry] = (await getShortlist(ctx, { userId: owner.id, shortlistId })).entries;
    await setShortlistNote(ctx, {
      userId: owner.id,
      shortlistId,
      itemId: entry?.itemId ?? '',
      note: 'Great reels',
    });

    const detail = await getShortlist(ctx, { userId: owner.id, shortlistId });
    expect(detail.entries).toHaveLength(1);
    expect(detail.entries[0]).toMatchObject({
      note: 'Great reels',
      creator: { displayName: 'Asha' },
    });
  });

  it('UC-D3 flags creators who are no longer available', async () => {
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const { creatorId } = await createSearchableCreator(ctx, db, { email: 'c@example.in' });
    const shortlistId = await createShortlist(ctx, { userId: owner.id, name: 'List' });
    await addToShortlist(ctx, { userId: owner.id, shortlistId, creatorId });

    await db.user.update({ where: { email: 'c@example.in' }, data: { status: 'SUSPENDED' } });

    const [entry] = (await getShortlist(ctx, { userId: owner.id, shortlistId })).entries;
    expect(entry?.creator).toBeNull();
  });

  it('FR-6.1 lists are private until shared with the team', async () => {
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const memberId = await teamMember(owner.id, 'member@spiceco.in');
    const shortlistId = await createShortlist(ctx, { userId: owner.id, name: 'Secret' });

    expect(await listShortlists(ctx, memberId)).toEqual([]);
    await expect(getShortlist(ctx, { userId: memberId, shortlistId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    await setShortlistShared(ctx, { userId: owner.id, shortlistId, isShared: true });
    expect((await listShortlists(ctx, memberId)).map((list) => list.name)).toEqual(['Secret']);
  });

  it('FR-6.1 team members can edit a shared list but not rename or delete it', async () => {
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const memberId = await teamMember(owner.id, 'member@spiceco.in');
    const { creatorId } = await createSearchableCreator(ctx, db, { email: 'c@example.in' });
    const shortlistId = await createShortlist(ctx, { userId: owner.id, name: 'Shared' });
    await setShortlistShared(ctx, { userId: owner.id, shortlistId, isShared: true });

    await addToShortlist(ctx, { userId: memberId, shortlistId, creatorId });
    await expect(
      renameShortlist(ctx, { userId: memberId, shortlistId, name: 'Mine now' }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(deleteShortlist(ctx, { userId: memberId, shortlistId })).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
    const [entry] = (await getShortlist(ctx, { userId: owner.id, shortlistId })).entries;
    await removeFromShortlist(ctx, { userId: memberId, shortlistId, itemId: entry?.itemId ?? '' });
    expect((await getShortlist(ctx, { userId: owner.id, shortlistId })).entries).toEqual([]);
  });

  it('FR-11 respects the plan’s shortlist limit', async () => {
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in', 'TRIAL');
    await db.plan.updateMany({ where: { code: 'TRIAL' }, data: { shortlistLimit: 1 } });
    await createShortlist(ctx, { userId: owner.id, name: 'One' });

    await expect(createShortlist(ctx, { userId: owner.id, name: 'Two' })).rejects.toMatchObject({
      code: 'PLAN_LIMIT_REACHED',
    });
  });
});

describe('CSV export (FR-6.3)', () => {
  it('FR-6.3 exports public fields only, with notes, and neutralises formulas', async () => {
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const { creatorId } = await createSearchableCreator(ctx, db, {
      email: 'secret@example.in',
      displayName: '=cmd()',
    });
    const shortlistId = await createShortlist(ctx, { userId: owner.id, name: 'Export me' });
    await addToShortlist(ctx, { userId: owner.id, shortlistId, creatorId });

    const { filename, csv } = await exportShortlistCsv(ctx, {
      userId: owner.id,
      shortlistId,
      labels,
    });

    expect(filename).toBe('Export-me.csv');
    expect(csv).toContain("'=cmd()");
    expect(csv).toContain('https://app.test/c/');
    expect(csv).not.toContain('secret@example.in');
  });

  it('FR-11 CSV export needs a plan that includes it', async () => {
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in', 'STARTER');
    const shortlistId = await createShortlist(ctx, { userId: owner.id, name: 'List' });

    await expect(
      exportShortlistCsv(ctx, { userId: owner.id, shortlistId, labels }),
    ).rejects.toMatchObject({
      code: 'PLAN_LIMIT_REACHED',
    });
  });
});
