import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getRequest } from '@/services/requests';
import {
  appealFlag,
  closeReport,
  getChatForReview,
  getOwnFlags,
  getReport,
  listReports,
  openChatForReview,
  resolveDispute,
  reviewFlag,
  warnUser,
} from '@/services/moderation';
import { saveNotificationPreferences } from '@/services/notifications';
import { reportChatPartner } from '@/services/reports';
import { createAdmin } from './admin-fixtures';
import { acceptedRequest } from './collaboration-fixtures';
import { createSearchableCreator } from './discovery-fixtures';
import { createTestDatabaseClient } from './test-database';
import { createTestContext, requestFrom, resetDatabase, type TestContext } from './test-context';

const HOUR_MS = 3_600_000;
const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

const request = requestFrom('203.0.113.60');

/** A chat in which the brand reported the creator. */
async function reportedChat() {
  const parties = await acceptedRequest(ctx, db);
  const threadId =
    (await getRequest(ctx, { userId: parties.brand.id, requestId: parties.requestId })).chatId ??
    '';
  await reportChatPartner(ctx, {
    userId: parties.brand.id,
    threadId,
    reason: 'Asked us to pay a joining fee',
  });
  const report = await db.report.findFirstOrThrow();
  return { ...parties, threadId, reportId: report.id };
}

describe('reports (UC-M1)', () => {
  it('UC-M1 shows who and what a report is about, and the reporter’s history', async () => {
    const admin = await createAdmin(ctx);
    const { reportId, creatorUser } = await reportedChat();

    const report = await getReport(ctx, { adminUserId: admin.id, reportId });

    expect(report).toMatchObject({
      targetType: 'CREATOR',
      target: { label: 'Asha Cooks', userIds: [creatorUser.id] },
      reporterHistory: { total: 1, dismissed: 0 },
    });
  });

  it('UC-M1 closes a report once, with a note, and audits it', async () => {
    const admin = await createAdmin(ctx);
    const { reportId } = await reportedChat();
    const close = () =>
      closeReport(ctx, {
        adminUserId: admin.id,
        request,
        reportId,
        outcome: 'DISMISSED',
        note: 'No evidence in the chat',
      });

    await close();

    await expect(close()).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(
      (await listReports(ctx, { adminUserId: admin.id, status: 'DISMISSED', page: 1 })).items,
    ).toHaveLength(1);
    expect(await db.auditEvent.count({ where: { action: 'report.dismissed' } })).toBe(1);
  });

  it('UC-M1 warnings always reach the user, whatever their notification settings', async () => {
    const admin = await createAdmin(ctx);
    const { creatorUser } = await reportedChat();
    await saveNotificationPreferences(ctx, {
      userId: creatorUser.id,
      role: 'CREATOR',
      enabled: [],
    });

    await warnUser(ctx, {
      adminUserId: admin.id,
      request,
      userId: creatorUser.id,
      reason: 'Do not ask brands for joining fees',
    });

    expect(
      await db.emailOutbox.count({
        where: { template: 'accountWarning', toAddress: 'creator@example.in' },
      }),
    ).toBe(1);
  });
});

describe('chat access (SEC-11)', () => {
  it('SEC-11 an admin reads a chat only with a logged reason, for an hour', async () => {
    const admin = await createAdmin(ctx);
    const { threadId, reportId, brand } = await reportedChat();
    await ctx.repos.chat.addMessage({
      threadId,
      senderUserId: brand.id,
      senderSide: 'BRAND',
      body: 'Please pay the joining fee first',
      contactFlags: [],
      createdAt: ctx.clock.now(),
      attachment: null,
    });

    const grantId = await openChatForReview(ctx, {
      adminUserId: admin.id,
      request,
      threadId,
      reportId,
      reason: 'Checking the reported fee request',
    });
    const chat = await getChatForReview(ctx, { adminUserId: admin.id, grantId });

    expect(chat.messages.map((message) => message.body)).toEqual([
      'Please pay the joining fee first',
    ]);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'chat.opened' } });
    expect(audit.metadata).toMatchObject({ threadId, reason: 'Checking the reported fee request' });

    const otherAdmin = await createAdmin(ctx, 'other-admin@platform.in');
    await expect(
      getChatForReview(ctx, { adminUserId: otherAdmin.id, grantId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    ctx.clock.advance(HOUR_MS);
    await expect(getChatForReview(ctx, { adminUserId: admin.id, grantId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('authenticity flags (UC-M2)', () => {
  async function flaggedCreator() {
    const { creatorId } = await createSearchableCreator(ctx, db, { email: 'asha@example.in' });
    const creatorUser = await db.user.findUniqueOrThrow({ where: { email: 'asha@example.in' } });
    const flag = await db.authenticityFlag.create({
      data: { creatorId, type: 'FOLLOWER_SPIKE', details: { percent: 50 } },
    });
    return { creatorId, creatorUser, flagId: flag.id };
  }

  it('UC-M2 clearing a flag stops that signal counting for 90 days', async () => {
    const admin = await createAdmin(ctx);
    const { creatorId, flagId } = await flaggedCreator();

    await reviewFlag(ctx, { adminUserId: admin.id, request, flagId, decision: 'CLEARED' });

    const since = new Date(ctx.clock.now().getTime() - 90 * 24 * HOUR_MS);
    expect(await ctx.repos.scores.recentlyClearedFlagTypes(creatorId, since)).toEqual([
      'FOLLOWER_SPIKE',
    ]);
    expect(await db.auditEvent.count({ where: { action: 'flag.cleared' } })).toBe(1);
  });

  it('UC-M2 the creator appeals a "suspicious" decision and it returns to the queue', async () => {
    const admin = await createAdmin(ctx);
    const { creatorUser, flagId } = await flaggedCreator();
    await reviewFlag(ctx, { adminUserId: admin.id, request, flagId, decision: 'SUSPICIOUS' });
    expect((await getOwnFlags(ctx, creatorUser.id))[0]?.status).toBe('SUSPICIOUS');

    await appealFlag(ctx, {
      userId: creatorUser.id,
      flagId,
      appealText: 'A reel went viral after a celebrity shared it',
    });

    const flag = await db.authenticityFlag.findUniqueOrThrow({ where: { id: flagId } });
    expect(flag).toMatchObject({
      status: 'OPEN',
      appealText: 'A reel went viral after a celebrity shared it',
    });
  });

  it('SEC-2 a creator cannot appeal someone else’s flag', async () => {
    const admin = await createAdmin(ctx);
    const { flagId } = await flaggedCreator();
    await reviewFlag(ctx, { adminUserId: admin.id, request, flagId, decision: 'SUSPICIOUS' });
    await createSearchableCreator(ctx, db, { email: 'other@example.in' });
    const other = await db.user.findUniqueOrThrow({ where: { email: 'other@example.in' } });

    await expect(
      appealFlag(ctx, { userId: other.id, flagId, appealText: 'Not my flag but trying anyway' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('ownership disputes (UC-M3)', () => {
  async function dispute(isClaimVerified: boolean) {
    const owner = await createSearchableCreator(ctx, db, { email: 'owner@example.in' });
    const claimant = await createSearchableCreator(ctx, db, { email: 'claimant@example.in' });
    const claimantUser = await db.user.findUniqueOrThrow({
      where: { email: 'claimant@example.in' },
    });
    const account = await db.socialAccount.findFirstOrThrow({
      where: { creatorId: owner.creatorId },
    });
    await ctx.repos.socialAccounts.createDispute({
      socialAccountId: account.id,
      claimantUserId: claimantUser.id,
      isClaimVerified,
    });
    const created = await db.ownershipDispute.findFirstOrThrow();
    return { owner, claimant, account, disputeId: created.id };
  }

  it('UC-M3 moving the account to the claimant removes old tokens and emails both sides', async () => {
    const admin = await createAdmin(ctx);
    const { claimant, account, disputeId } = await dispute(true);

    await resolveDispute(ctx, {
      adminUserId: admin.id,
      request,
      disputeId,
      decision: 'TRANSFER',
      note: 'Claimant proved ownership with the latest login',
    });

    const moved = await db.socialAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(moved).toMatchObject({
      creatorId: claimant.creatorId,
      isVerified: false,
      accessTokenEncrypted: null,
    });
    const templates = (
      await db.emailOutbox.findMany({ where: { template: { startsWith: 'dispute' } } })
    )
      .map((email) => `${email.template}:${email.toAddress}`)
      .sort();
    expect(templates).toEqual(['disputeLost:owner@example.in', 'disputeWon:claimant@example.in']);
    expect((await db.ownershipDispute.findUniqueOrThrow({ where: { id: disputeId } })).status).toBe(
      'RESOLVED',
    );
  });

  it('UC-M3 keeping the account with its owner tells only the claimant', async () => {
    const admin = await createAdmin(ctx);
    const { owner, account, disputeId } = await dispute(false);

    await resolveDispute(ctx, {
      adminUserId: admin.id,
      request,
      disputeId,
      decision: 'KEEP',
      note: 'Claimant could not prove ownership',
    });

    expect(
      (await db.socialAccount.findUniqueOrThrow({ where: { id: account.id } })).creatorId,
    ).toBe(owner.creatorId);
    const emails = await db.emailOutbox.findMany({
      where: { template: { startsWith: 'dispute' } },
    });
    expect(emails.map((email) => email.toAddress)).toEqual(['claimant@example.in']);
  });
});
