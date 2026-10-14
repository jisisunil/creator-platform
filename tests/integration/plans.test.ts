import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { searchCreators } from '@/services/discovery';
import {
  addCreditPack,
  changeBrandPlan,
  extendTrial,
  getPlanOverview,
  sendTrialReminders,
} from '@/services/plans';
import { inviteTeamMember } from '@/services/team';
import { createVerifiedUser } from './accounts/fixtures';
import { sendTestRequest } from './collaboration-fixtures';
import { createBrandOwner, createSearchableCreator } from './discovery-fixtures';
import { createTestDatabaseClient } from './test-database';
import { createTestContext, requestFrom, resetDatabase, type TestContext } from './test-context';

const DAY_MS = 86_400_000;
const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

async function setFreeBeta(isActive: boolean): Promise<void> {
  await db.platformSetting.upsert({
    where: { key: 'isFreeBetaActive' },
    create: { key: 'isFreeBetaActive', value: isActive },
    update: { value: isActive },
  });
}

/** A brand owner who signed up through the real flow (starting plan chosen by the service). */
async function signUpBrand(email: string) {
  const owner = await createVerifiedUser(ctx, db, { email, role: 'BRAND' });
  const brand = await db.brand.findFirstOrThrow({
    where: { members: { some: { userId: owner.id } } },
    include: { plan: true },
  });
  return { owner, brand };
}

async function createAdmin() {
  return ctx.repos.users.create({
    email: 'admin@platform.in',
    passwordHash: null,
    name: 'Admin',
    role: 'ADMIN',
    status: 'ACTIVE',
    emailVerifiedAt: ctx.clock.now(),
    countryCode: 'IN',
    locale: 'en',
  });
}

describe('starting plans and trials (UC-B1, UC-D1)', () => {
  it('UC-B1 new brands get the free beta while it runs', async () => {
    await setFreeBeta(true);

    const { brand } = await signUpBrand('owner@spiceco.in');

    expect(brand.plan.code).toBe('FREE_BETA');
    expect(brand.trialEndsAt).toBeNull();
  });

  it('UC-B1 after the beta, new brands get a 14-day trial', async () => {
    await setFreeBeta(false);

    const { brand } = await signUpBrand('owner@spiceco.in');

    expect(brand.plan.code).toBe('TRIAL');
    expect(brand.hasHadTrial).toBe(true);
    expect(brand.trialEndsAt?.getTime()).toBe(ctx.clock.now().getTime() + 14 * DAY_MS);
  });

  it('UC-B1 one trial per company: a second brand from the same domain starts with it ended', async () => {
    await setFreeBeta(false);
    await signUpBrand('owner@spiceco.in');

    const { owner, brand } = await signUpBrand('marketing@spiceco.in');

    expect(brand.hasHadTrial).toBe(false);
    expect(brand.trialEndsAt?.getTime()).toBe(ctx.clock.now().getTime());
    expect(
      await db.auditEvent.count({
        where: { action: 'trial.repeat-detected', actorUserId: owner.id },
      }),
    ).toBe(1);
  });

  it('UC-B1 a repeated sign-up behind a Gmail "+tag" or dots gets no new trial', async () => {
    await setFreeBeta(false);
    await signUpBrand('ravi.kumar@gmail.com');

    const { brand } = await signUpBrand('ravikumar+brand2@gmail.com');

    expect(brand.hasHadTrial).toBe(false);
  });

  it('UC-B1 different people on Gmail each get a trial', async () => {
    await setFreeBeta(false);
    await signUpBrand('ravi@gmail.com');

    const { brand } = await signUpBrand('asha@gmail.com');

    expect(brand.hasHadTrial).toBe(true);
  });

  it('UC-D1 after the trial, search still works but contacting is blocked', async () => {
    await setFreeBeta(false);
    const { owner } = await signUpBrand('owner@spiceco.in');
    const { creatorId } = await createSearchableCreator(ctx, db, { email: 'c@example.in' });
    ctx.clock.advance(15 * DAY_MS);

    const results = await searchCreators(ctx, {
      userId: owner.id,
      filters: {},
      sort: 'score',
      page: 1,
    });
    expect(results.total).toBe(1);
    await expect(
      sendTestRequest(ctx, owner.id, creatorId, { deadline: '2026-12-20' }),
    ).rejects.toMatchObject({
      code: 'PLAN_LIMIT_REACHED',
      fieldErrors: { plan: 'plan.trialEnded' },
    });
    expect((await getPlanOverview(ctx, owner.id)).allowance.kind).toBe('TRIAL_ENDED');
  });

  it('UC-B1 sends "trial ends soon" and "trial ended" emails once each', async () => {
    await setFreeBeta(false);
    await signUpBrand('owner@spiceco.in');

    ctx.clock.advance(10 * DAY_MS);
    expect(await sendTrialReminders(ctx)).toEqual({ ending: 0, ended: 0 });
    ctx.clock.advance(1 * DAY_MS + 1);
    expect(await sendTrialReminders(ctx)).toEqual({ ending: 1, ended: 0 });
    expect(await sendTrialReminders(ctx)).toEqual({ ending: 0, ended: 0 });
    ctx.clock.advance(3 * DAY_MS);
    expect(await sendTrialReminders(ctx)).toEqual({ ending: 0, ended: 1 });
    expect(await sendTrialReminders(ctx)).toEqual({ ending: 0, ended: 0 });

    const templates = (await db.emailOutbox.findMany({ where: { toAddress: 'owner@spiceco.in' } }))
      .map((email) => email.template)
      .filter((template) => template.startsWith('trial'));
    expect(templates.sort()).toEqual(['trialEnded', 'trialEnding']);
  });
});

describe('pay-as-you-go credits (FR-11.1, UC-B2)', () => {
  it('needs a credit pack, and each request uses one credit', async () => {
    const admin = await createAdmin();
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const brandId = (await db.brandMember.findUniqueOrThrow({ where: { userId: owner.id } }))
      .brandId;
    await changeBrandPlan(ctx, { adminUserId: admin.id, brandId, planCode: 'PAY_AS_YOU_GO' });
    const { creatorId } = await createSearchableCreator(ctx, db, { email: 'c@example.in' });

    await expect(sendTestRequest(ctx, owner.id, creatorId)).rejects.toMatchObject({
      fieldErrors: { plan: 'plan.noCredits' },
    });
    await addCreditPack(ctx, { adminUserId: admin.id, brandId, packCode: 'PACK_10' });
    await sendTestRequest(ctx, owner.id, creatorId);

    const overview = await getPlanOverview(ctx, owner.id);
    expect(overview.allowance).toEqual({ kind: 'CREDITS', remaining: 9 });
    const request = await db.collabRequest.findFirstOrThrow();
    expect(request.creditPackId).toBe(overview.creditPacks[0]?.id);
  });

  it('UC-B2 two requests racing for the last credit: one is sent, nothing half-saved', async () => {
    const admin = await createAdmin();
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const brandId = (await db.brandMember.findUniqueOrThrow({ where: { userId: owner.id } }))
      .brandId;
    await changeBrandPlan(ctx, { adminUserId: admin.id, brandId, planCode: 'PAY_AS_YOU_GO' });
    await addCreditPack(ctx, { adminUserId: admin.id, brandId, packCode: 'PACK_10' });
    await db.creditPack.updateMany({ data: { creditsUsed: 9 } });
    const first = await createSearchableCreator(ctx, db, { email: 'a@example.in' });
    const second = await createSearchableCreator(ctx, db, { email: 'b@example.in' });

    const results = await Promise.allSettled([
      sendTestRequest(ctx, owner.id, first.creatorId),
      sendTestRequest(ctx, owner.id, second.creatorId),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.collabRequest.count()).toBe(1);
    expect((await db.creditPack.findFirstOrThrow()).creditsUsed).toBe(10);
  });

  it('expired credits cannot be used', async () => {
    const admin = await createAdmin();
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const brandId = (await db.brandMember.findUniqueOrThrow({ where: { userId: owner.id } }))
      .brandId;
    await changeBrandPlan(ctx, { adminUserId: admin.id, brandId, planCode: 'PAY_AS_YOU_GO' });
    await addCreditPack(ctx, { adminUserId: admin.id, brandId, packCode: 'PACK_10' });
    const { creatorId } = await createSearchableCreator(ctx, db, { email: 'c@example.in' });
    ctx.clock.advance(91 * DAY_MS);

    await expect(
      sendTestRequest(ctx, owner.id, creatorId, { deadline: '2027-02-20' }),
    ).rejects.toMatchObject({ fieldErrors: { plan: 'plan.noCredits' } });
  });
});

describe('admin plan changes (FR-11.3, UC-B3)', () => {
  it('FR-11.3 only admins change plans, and every change is audited', async () => {
    const admin = await createAdmin();
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in', 'TRIAL');
    const brandId = (await db.brandMember.findUniqueOrThrow({ where: { userId: owner.id } }))
      .brandId;

    await expect(
      changeBrandPlan(ctx, { adminUserId: owner.id, brandId, planCode: 'AGENCY' }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await changeBrandPlan(ctx, { adminUserId: admin.id, brandId, planCode: 'STARTER' });

    const overview = await getPlanOverview(ctx, owner.id);
    expect(overview.plan.code).toBe('STARTER');
    expect(overview.allowance).toMatchObject({ kind: 'PERIOD', limit: 50, remaining: 50 });
    expect(
      await db.auditEvent.findFirstOrThrow({ where: { action: 'plan.changed' } }),
    ).toMatchObject({ category: 'ADMIN', actorUserId: admin.id });
  });

  it('FR-11.3 extends an ended trial from today', async () => {
    await setFreeBeta(false);
    const admin = await createAdmin();
    const { owner, brand } = await signUpBrand('owner@spiceco.in');
    ctx.clock.advance(20 * DAY_MS);

    await extendTrial(ctx, { adminUserId: admin.id, brandId: brand.id, days: 7 });

    const overview = await getPlanOverview(ctx, owner.id);
    expect(overview.trialEndsAt?.getTime()).toBe(ctx.clock.now().getTime() + 7 * DAY_MS);
    expect(overview.allowance.kind).toBe('PERIOD');
  });

  it('UC-B3 a downgrade keeps existing members but blocks new invites', async () => {
    const admin = await createAdmin();
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in', 'PRO');
    const brandId = (await db.brandMember.findUniqueOrThrow({ where: { userId: owner.id } }))
      .brandId;
    await inviteTeamMember(
      ctx,
      { ownerUserId: owner.id, email: 'member@spiceco.in' },
      requestFrom(),
    );
    await changeBrandPlan(ctx, { adminUserId: admin.id, brandId, planCode: 'STARTER' });

    await expect(
      inviteTeamMember(ctx, { ownerUserId: owner.id, email: 'another@spiceco.in' }, requestFrom()),
    ).rejects.toMatchObject({ fieldErrors: { plan: 'plan.seatsFull' } });
    expect((await getPlanOverview(ctx, owner.id)).seats).toEqual({ used: 2, limit: 1 });
  });
});
