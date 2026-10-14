import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { signInWithPassword } from '@/services/accounts';
import { getChat, sendMessage } from '@/services/chat';
import { getDeal } from '@/services/deals';
import { searchCreators } from '@/services/discovery';
import {
  closeDataRequest,
  deleteMyAccount,
  deleteUnderageAccount,
  exportMyData,
  finaliseDeletions,
  getDeletionImpact,
  listDataRequests,
  requestCorrection,
} from '@/services/privacy';
import { getRequest } from '@/services/requests';
import { transferOwnership } from '@/services/team';
import { createVerifiedUser } from './accounts/fixtures';
import { createAdmin } from './admin-fixtures';
import { acceptedRequest } from './collaboration-fixtures';
import { createBrandOwner, createSearchableCreator } from './discovery-fixtures';
import { createTestDatabaseClient } from './test-database';
import {
  createTestContext,
  requestFrom,
  resetDatabase,
  STRONG_PASSWORD,
  type TestContext,
} from './test-context';

const DAY_MS = 86_400_000;
const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

const request = requestFrom('203.0.113.70');

/** An accepted deal with one message from each side. */
async function collaboration() {
  const parties = await acceptedRequest(ctx, db);
  const view = await getRequest(ctx, { userId: parties.brand.id, requestId: parties.requestId });
  const threadId = view.chatId ?? '';
  await sendMessage(ctx, {
    userId: parties.brand.id,
    threadId,
    body: 'Brand says hi',
    attachment: null,
  });
  await sendMessage(ctx, {
    userId: parties.creatorUser.id,
    threadId,
    body: 'Creator says hello',
    attachment: null,
  });
  return { ...parties, threadId, dealId: view.dealId ?? '' };
}

describe('download my data (PRV-2)', () => {
  it('PRV-2 exports the profile, the messages they sent and consent history, never secrets', async () => {
    const { creatorUser } = await collaboration();

    const { filename, json } = await exportMyData(ctx, { userId: creatorUser.id, request });

    const data = JSON.parse(json);
    expect(filename).toMatch(/^my-data-\d{4}-\d{2}-\d{2}\.json$/);
    expect(data.email).toBe('creator@example.in');
    expect(data.creatorProfile.displayName).toBe('Asha Cooks');
    expect(data.consents.length).toBeGreaterThan(0);
    expect(data.sentMessages.map((message: { body: string }) => message.body)).toEqual([
      'Creator says hello',
    ]);
    expect(json).not.toContain('Brand says hi');
    expect(json).not.toMatch(/passwordHash|accessToken|totpSecret|tokenHash/);
    expect(
      await db.auditEvent.count({ where: { action: 'data.exported', category: 'DATA' } }),
    ).toBe(1);
  });

  it('SR-14 limits exports to a few a day', async () => {
    const { creatorUser } = await collaboration();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await exportMyData(ctx, { userId: creatorUser.id, request });
    }

    await expect(exportMyData(ctx, { userId: creatorUser.id, request })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });
});

describe('correct my data (PRV-3, UC-M4)', () => {
  it('PRV-3 a correction request is due in 30 days and an admin answers it', async () => {
    const admin = await createAdmin(ctx);
    const { creatorUser } = await collaboration();

    await requestCorrection(ctx, {
      userId: creatorUser.id,
      details: 'My follower count shows the old channel',
    });
    const [open] = (await listDataRequests(ctx, { adminUserId: admin.id, status: 'OPEN', page: 1 }))
      .items;
    expect(open).toMatchObject({ type: 'CORRECTION', isOverdue: false });
    expect(open?.dueAt.getTime()).toBe(ctx.clock.now().getTime() + 30 * DAY_MS);

    ctx.clock.advance(31 * DAY_MS);
    const [overdue] = (
      await listDataRequests(ctx, { adminUserId: admin.id, status: 'OPEN', page: 1 })
    ).items;
    expect(overdue?.isOverdue).toBe(true);

    await closeDataRequest(ctx, {
      adminUserId: admin.id,
      requestId: open?.id ?? '',
      outcome: 'COMPLETED',
      resolution: 'Refreshed the channel stats',
      request,
    });
    expect((await db.dataRequest.findUniqueOrThrow({ where: { id: open?.id } })).status).toBe(
      'COMPLETED',
    );
  });
});

describe('delete my account (PRV-4, UC-A5)', () => {
  it('PRV-4 closes the account at once: signed out, hidden, no sign-in, deals cancelled and the other side told', async () => {
    const { brand, creatorUser, dealId } = await collaboration();
    expect((await getDeletionImpact(ctx, creatorUser.id)).openDeals).toBe(1);

    await expect(
      deleteMyAccount(ctx, { userId: creatorUser.id, confirmEmail: 'wrong@example.in', request }),
    ).rejects.toMatchObject({ fieldErrors: { confirmEmail: 'privacy.confirmEmail' } });
    await deleteMyAccount(ctx, {
      userId: creatorUser.id,
      confirmEmail: 'Creator@Example.in',
      request,
    });

    expect((await db.user.findUniqueOrThrow({ where: { id: creatorUser.id } })).status).toBe(
      'DELETION_PENDING',
    );
    expect(await db.session.count({ where: { userId: creatorUser.id } })).toBe(0);
    expect(
      (await searchCreators(ctx, { userId: brand.id, filters: {}, sort: 'score', page: 1 })).total,
    ).toBe(0);
    await expect(
      signInWithPassword(
        ctx,
        { email: 'creator@example.in', password: STRONG_PASSWORD, captchaToken: null },
        request,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(await getDeal(ctx, { userId: brand.id, dealId })).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'Account deleted',
    });
    expect(
      await db.emailOutbox.count({
        where: { template: 'dealCancelled', toAddress: 'owner@spiceco.in' },
      }),
    ).toBe(1);
    expect(
      await db.emailOutbox.count({
        where: { template: 'accountDeletionScheduled', toAddress: 'creator@example.in' },
      }),
    ).toBe(1);
  });

  it('PRV-4 after 30 days the data is anonymised; the other side sees "Deleted user"', async () => {
    const { brand, creatorUser, threadId } = await collaboration();
    await deleteMyAccount(ctx, {
      userId: creatorUser.id,
      confirmEmail: 'creator@example.in',
      request,
    });
    const consentsBefore = await db.consentRecord.count({ where: { userId: creatorUser.id } });

    ctx.clock.advance(29 * DAY_MS);
    expect(await finaliseDeletions(ctx)).toEqual({ anonymised: 0 });
    ctx.clock.advance(2 * DAY_MS);
    expect(await finaliseDeletions(ctx)).toEqual({ anonymised: 1 });

    const user = await db.user.findUniqueOrThrow({ where: { id: creatorUser.id } });
    expect(user).toMatchObject({
      status: 'ANONYMISED',
      name: 'Deleted user',
      email: `deleted-${creatorUser.id}@deleted.invalid`,
      passwordHash: null,
    });
    const profile = await db.creatorProfile.findUniqueOrThrow({
      where: { userId: creatorUser.id },
    });
    expect(profile).toMatchObject({ displayName: 'Deleted user', bio: '', city: '' });
    expect(await db.socialAccount.count({ where: { creatorId: profile.id } })).toBe(0);
    const chat = await getChat(ctx, { userId: brand.id, threadId });
    expect(chat.messages.find((message) => !message.isMine)).toMatchObject({
      senderName: null,
      body: 'Creator says hello',
    });
    // Consent records stay for the legal hold.
    expect(await db.consentRecord.count({ where: { userId: creatorUser.id } })).toBe(
      consentsBefore,
    );
  });

  it('UC-A5 a brand owner with a team must hand the brand over first', async () => {
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const colleague = await createVerifiedUser(ctx, db, {
      email: 'colleague@spiceco.in',
      role: 'BRAND',
    });
    const brandId = (await db.brandMember.findUniqueOrThrow({ where: { userId: owner.id } }))
      .brandId;
    await db.brandMember.update({
      where: { userId: colleague.id },
      data: { brandId, role: 'MEMBER' },
    });

    expect((await getDeletionImpact(ctx, owner.id)).mustTransferOwnership).toBe(true);
    await expect(
      deleteMyAccount(ctx, { userId: owner.id, confirmEmail: 'owner@spiceco.in', request }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await transferOwnership(ctx, { ownerUserId: owner.id, newOwnerUserId: colleague.id }, request);
    await deleteMyAccount(ctx, { userId: owner.id, confirmEmail: 'owner@spiceco.in', request });
    ctx.clock.advance(31 * DAY_MS);
    await finaliseDeletions(ctx);

    const brand = await db.brand.findUniqueOrThrow({
      where: { id: brandId },
      include: { members: true },
    });
    expect(brand.name).toBe('Test Brand Pvt Ltd');
    expect(brand.members.map((member) => [member.userId, member.role])).toEqual([
      [colleague.id, 'OWNER'],
    ]);
  });

  it('PRV-4 the last member of a brand closes the brand with them', async () => {
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const brandId = (await db.brandMember.findUniqueOrThrow({ where: { userId: owner.id } }))
      .brandId;

    await deleteMyAccount(ctx, { userId: owner.id, confirmEmail: 'owner@spiceco.in', request });
    ctx.clock.advance(31 * DAY_MS);
    await finaliseDeletions(ctx);

    expect((await db.brand.findUniqueOrThrow({ where: { id: brandId } })).name).toBe(
      'Deleted brand',
    );
  });
});

describe('under-18 accounts (PR-6, PRV-6)', () => {
  it('PRV-6 an under-18 account is deleted at once and audited', async () => {
    const admin = await createAdmin(ctx);
    await createSearchableCreator(ctx, db, { email: 'young@example.in' });
    const young = await db.user.findUniqueOrThrow({ where: { email: 'young@example.in' } });

    await deleteUnderageAccount(ctx, {
      adminUserId: admin.id,
      userId: young.id,
      reason: 'Parent confirmed the creator is 16',
      request,
    });

    expect((await db.user.findUniqueOrThrow({ where: { id: young.id } })).status).toBe(
      'ANONYMISED',
    );
    expect(await db.auditEvent.count({ where: { action: 'user.deleted-underage' } })).toBe(1);
  });
});
