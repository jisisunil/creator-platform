import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acceptInviteWithNewAccount,
  getTeamOverview,
  inviteTeamMember,
  removeTeamMember,
  revokeTeamInvite,
} from '@/services/team';
import { createVerifiedUser } from '../integration/accounts/fixtures';
import { createTestDatabaseClient } from '../integration/test-database';
import {
  createTestContext,
  latestEmailLink,
  requestFrom,
  resetDatabase,
  STRONG_PASSWORD,
  type TestContext,
  tokenFromLink,
} from '../integration/test-context';

const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
  await db.plan.updateMany({ data: { seatLimit: 5 } });
});
afterAll(() => db.$disconnect());

async function brandWithMember(prefix: string) {
  const owner = await createVerifiedUser(ctx, db, {
    email: `${prefix}-owner@example.in`,
    role: 'BRAND',
  });
  await inviteTeamMember(
    ctx,
    { ownerUserId: owner.id, email: `${prefix}-member@example.in` },
    requestFrom(),
  );
  const token = tokenFromLink(
    await latestEmailLink(db, 'teamInvite', `${prefix}-member@example.in`),
  );
  const member = await acceptInviteWithNewAccount(
    ctx,
    { token, name: 'Member', password: STRONG_PASSWORD, acceptsMarketing: false },
    requestFrom(),
  );
  await inviteTeamMember(
    ctx,
    { ownerUserId: owner.id, email: `${prefix}-pending@example.in` },
    requestFrom(),
  );
  const invite = await db.brandInvite.findFirstOrThrow({
    where: { email: `${prefix}-pending@example.in` },
  });
  return { ownerId: owner.id, memberId: member.userId, inviteId: invite.id };
}

describe('team access across accounts (SR-5, SEC-2)', () => {
  it('SEC-2 an owner cannot remove another brand\'s member (looks like "not found")', async () => {
    const brandA = await brandWithMember('a');
    const brandB = await brandWithMember('b');

    await expect(
      removeTeamMember(
        ctx,
        { ownerUserId: brandA.ownerId, memberUserId: brandB.memberId },
        requestFrom(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await db.brandMember.count({ where: { userId: brandB.memberId } })).toBe(1);
  });

  it("SEC-2 an owner cannot revoke another brand's invite", async () => {
    const brandA = await brandWithMember('a');
    const brandB = await brandWithMember('b');

    await expect(
      revokeTeamInvite(
        ctx,
        { ownerUserId: brandA.ownerId, inviteId: brandB.inviteId },
        requestFrom(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(
      (await db.brandInvite.findUniqueOrThrow({ where: { id: brandB.inviteId } })).revokedAt,
    ).toBeNull();
  });

  it('SR-5 a member cannot invite, remove or revoke (owner only)', async () => {
    const brand = await brandWithMember('a');

    await expect(
      inviteTeamMember(ctx, { ownerUserId: brand.memberId, email: 'x@example.in' }, requestFrom()),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(
      removeTeamMember(
        ctx,
        { ownerUserId: brand.memberId, memberUserId: brand.ownerId },
        requestFrom(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(
      revokeTeamInvite(
        ctx,
        { ownerUserId: brand.memberId, inviteId: brand.inviteId },
        requestFrom(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('SR-5 an owner cannot remove themselves or another owner', async () => {
    const brand = await brandWithMember('a');

    await expect(
      removeTeamMember(
        ctx,
        { ownerUserId: brand.ownerId, memberUserId: brand.ownerId },
        requestFrom(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('SR-5 creators have no team to see', async () => {
    const creator = await createVerifiedUser(ctx, db, { email: 'creator@example.in' });

    await expect(getTeamOverview(ctx, creator.id)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('SR-12 a team overview never contains password hashes or tokens', async () => {
    const brand = await brandWithMember('a');

    const team = JSON.stringify(await getTeamOverview(ctx, brand.ownerId));

    expect(team).not.toContain('argon2');
    expect(team).not.toContain('tokenHash');
  });
});
