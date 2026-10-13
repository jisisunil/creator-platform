import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resolveSession, signInWithPassword } from '@/services/accounts';
import {
  acceptInviteAsSignedInUser,
  acceptInviteWithNewAccount,
  getTeamOverview,
  inviteTeamMember,
  removeTeamMember,
} from '@/services/team';
import { createVerifiedUser } from './accounts/fixtures';
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

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

async function createOwnerWithSeats(email: string, seats: number) {
  const owner = await createVerifiedUser(ctx, db, { email, role: 'BRAND' });
  const brand = await db.brand.findFirstOrThrow({
    where: { members: { some: { userId: owner.id } } },
  });
  const plan = await db.plan.findFirstOrThrow({ where: { seatLimit: { gte: seats } } });
  await db.brand.update({ where: { id: brand.id }, data: { planId: plan.id } });
  await db.plan.update({ where: { id: plan.id }, data: { seatLimit: seats } });
  return owner;
}

async function inviteAndGetToken(ownerId: string, email: string): Promise<string> {
  await inviteTeamMember(ctx, { ownerUserId: ownerId, email }, requestFrom());
  return tokenFromLink(await latestEmailLink(db, 'teamInvite', email.toLowerCase()));
}

describe('team invites (UC-A6)', () => {
  it('UC-A6 a new person joins by creating an account from the invite', async () => {
    const owner = await createOwnerWithSeats('owner@spiceco.in', 3);
    const token = await inviteAndGetToken(owner.id, 'Member@SpiceCo.in');

    const result = await acceptInviteWithNewAccount(
      ctx,
      { token, name: 'New Member', password: STRONG_PASSWORD, acceptsMarketing: false },
      requestFrom(),
    );

    const member = await db.user.findUniqueOrThrow({ where: { email: 'member@spiceco.in' } });
    expect(member).toMatchObject({ role: 'BRAND', status: 'ACTIVE' });
    expect(result.userId).toBe(member.id);
    const team = await getTeamOverview(ctx, owner.id);
    expect(team.members.map((m) => [m.email, m.role])).toEqual([
      ['owner@spiceco.in', 'OWNER'],
      ['member@spiceco.in', 'MEMBER'],
    ]);
    expect(await db.brand.count()).toBe(1);
  });

  it('UC-A6 refuses new invites once seats (including pending invites) are full', async () => {
    const owner = await createOwnerWithSeats('owner@spiceco.in', 2);
    await inviteTeamMember(ctx, { ownerUserId: owner.id, email: 'one@spiceco.in' }, requestFrom());

    await expect(
      inviteTeamMember(ctx, { ownerUserId: owner.id, email: 'two@spiceco.in' }, requestFrom()),
    ).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
  });

  it('UC-A6 refuses to invite a creator account', async () => {
    const owner = await createOwnerWithSeats('owner@spiceco.in', 3);
    await createVerifiedUser(ctx, db, { email: 'creator@example.in' });

    await expect(
      inviteTeamMember(ctx, { ownerUserId: owner.id, email: 'creator@example.in' }, requestFrom()),
    ).rejects.toMatchObject({ fieldErrors: { email: 'team.notABrandAccount' } });
  });

  it('UC-A6 expired invites cannot be used', async () => {
    const owner = await createOwnerWithSeats('owner@spiceco.in', 3);
    const token = await inviteAndGetToken(owner.id, 'late@spiceco.in');

    ctx.clock.advance(8 * 24 * 60 * 60_000);

    await expect(
      acceptInviteWithNewAccount(
        ctx,
        { token, name: 'Late', password: STRONG_PASSWORD, acceptsMarketing: false },
        requestFrom(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_LINK' });
  });

  it('UC-A6 removing a member ends their access immediately', async () => {
    const owner = await createOwnerWithSeats('owner@spiceco.in', 3);
    const token = await inviteAndGetToken(owner.id, 'member@spiceco.in');
    const joined = await acceptInviteWithNewAccount(
      ctx,
      { token, name: 'Member', password: STRONG_PASSWORD, acceptsMarketing: false },
      requestFrom(),
    );

    await removeTeamMember(
      ctx,
      { ownerUserId: owner.id, memberUserId: joined.userId },
      requestFrom(),
    );

    await expect(resolveSession(ctx, joined.session.token)).resolves.toBeNull();
    expect((await getTeamOverview(ctx, owner.id)).members).toHaveLength(1);
  });

  it('UC-A6 an existing brand account without a team can accept while signed in', async () => {
    const owner = await createOwnerWithSeats('owner@spiceco.in', 3);
    const loner = await createVerifiedUser(ctx, db, { email: 'loner@spiceco.in', role: 'BRAND' });
    await db.brandMember.delete({ where: { userId: loner.id } });
    const token = await inviteAndGetToken(owner.id, 'loner@spiceco.in');

    await acceptInviteAsSignedInUser(ctx, { token, userId: loner.id }, requestFrom());

    expect((await getTeamOverview(ctx, loner.id)).brandName).toBe('Test Brand Pvt Ltd');
  });

  it('UC-A6 an invite opened by a different signed-in account is refused', async () => {
    const owner = await createOwnerWithSeats('owner@spiceco.in', 3);
    const other = await createVerifiedUser(ctx, db, { email: 'other@spiceco.in', role: 'BRAND' });
    const token = await inviteAndGetToken(owner.id, 'intended@spiceco.in');

    await expect(
      acceptInviteAsSignedInUser(ctx, { token, userId: other.id }, requestFrom()),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('a member sees the team but not pending invites', async () => {
    const owner = await createOwnerWithSeats('owner@spiceco.in', 3);
    const token = await inviteAndGetToken(owner.id, 'member@spiceco.in');
    const joined = await acceptInviteWithNewAccount(
      ctx,
      { token, name: 'Member', password: STRONG_PASSWORD, acceptsMarketing: false },
      requestFrom(),
    );
    await inviteTeamMember(
      ctx,
      { ownerUserId: owner.id, email: 'pending@spiceco.in' },
      requestFrom(),
    );

    const team = await getTeamOverview(ctx, joined.userId);

    expect(team).toMatchObject({ viewerRole: 'MEMBER', pendingInvites: [], canInvite: false });
  });

  it('the invited member can sign in normally afterwards', async () => {
    const owner = await createOwnerWithSeats('owner@spiceco.in', 3);
    const token = await inviteAndGetToken(owner.id, 'member@spiceco.in');
    await acceptInviteWithNewAccount(
      ctx,
      { token, name: 'Member', password: STRONG_PASSWORD, acceptsMarketing: false },
      requestFrom(),
    );

    await expect(
      signInWithPassword(
        ctx,
        { email: 'member@spiceco.in', password: STRONG_PASSWORD, captchaToken: null },
        requestFrom(),
      ),
    ).resolves.toBeDefined();
  });
});
