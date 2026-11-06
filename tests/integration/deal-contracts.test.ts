import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acceptContract,
  approveWork,
  autoApproveDueWork,
  getDeal,
  getDealContract,
  issueContract,
  type IssueContractInput,
  markDealPaid,
  raiseDealDispute,
  requestChanges,
  submitWork,
} from '@/services/deals';
import { exportMyData } from '@/services/privacy';
import { openDeal, signContract } from './collaboration-fixtures';
import { createTestDatabaseClient } from './test-database';
import { createTestContext, resetDatabase, type TestContext } from './test-context';

const DAY_MS = 86_400_000;
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

type Parties = Awaited<ReturnType<typeof openDeal>>;

function issueAs(parties: Parties, overrides: Partial<IssueContractInput> = {}) {
  return issueContract(ctx, {
    userId: parties.brand.id,
    dealId: parties.dealId,
    amountRupees: 40_000,
    advancePercent: 25,
    paymentDueOn: null,
    additionalTerms: '',
    source: 'GENERATED',
    file: null,
    ...overrides,
  });
}

function submitProof(parties: Parties, overrides: Partial<Parameters<typeof submitWork>[1]> = {}) {
  return submitWork(ctx, {
    userId: parties.creatorUser.id,
    dealId: parties.dealId,
    note: 'Draft is ready',
    links: ['https://example.com/draft-video'],
    files: [],
    ...overrides,
  });
}

describe('deal contracts (ADR-012)', () => {
  it('ADR-012 the brand issues a contract that fixes the terms; the creator accepts that version', async () => {
    const parties = await openDeal(ctx, db);

    await issueAs(parties, { additionalTerms: 'No competing sweets brands for 30 days.' });
    const issued = await getDealContract(ctx, {
      userId: parties.creatorUser.id,
      dealId: parties.dealId,
    });

    expect(issued.state).toBe('AWAITING_CREATOR');
    expect(issued.canAccept).toBe(true);
    expect(issued.contract).toMatchObject({
      version: 1,
      source: 'GENERATED',
      additionalTerms: 'No competing sweets brands for 30 days.',
      terms: {
        amountMinor: 4_000_000,
        advancePercent: 25,
        brandName: 'Test Brand Pvt Ltd',
        reviewDays: 7,
        maxChangeRequests: 2,
      },
      acceptances: [expect.objectContaining({ side: 'BRAND' })],
    });
    expect(issued.contract?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(
      (await getDeal(ctx, { userId: parties.brand.id, dealId: parties.dealId })).agreedAmountMinor,
    ).toBe(4_000_000);

    await acceptContract(ctx, {
      userId: parties.creatorUser.id,
      dealId: parties.dealId,
      fingerprint: issued.contract?.fingerprint ?? '',
    });

    const signed = await getDeal(ctx, { userId: parties.creatorUser.id, dealId: parties.dealId });
    expect(signed.contract.state).toBe('SIGNED');
    expect(signed.allowedActions).toContain('SUBMIT_WORK');
    expect(await db.emailOutbox.count({ where: { template: 'contractAccepted' } })).toBe(1);
  });

  it('ADR-012 a new version replaces the old one and must be accepted again', async () => {
    const parties = await openDeal(ctx, db);
    const firstFingerprint = await signContract(ctx, parties);

    await issueAs(parties, { amountRupees: 45_000 });

    const view = await getDeal(ctx, { userId: parties.creatorUser.id, dealId: parties.dealId });
    expect(view.contract).toMatchObject({ state: 'AWAITING_CREATOR', version: 2 });
    expect(view.contract.fingerprint).not.toBe(firstFingerprint);
    expect(view.allowedActions).not.toContain('SUBMIT_WORK');
    // Accepting the version read earlier doesn't accept the new one.
    await expect(
      acceptContract(ctx, {
        userId: parties.creatorUser.id,
        dealId: parties.dealId,
        fingerprint: firstFingerprint,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(submitProof(parties)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('ADR-012 the brand can use its own PDF, which each version keeps a copy of', async () => {
    const parties = await openDeal(ctx, db);

    await issueAs(parties, { source: 'UPLOADED', file: { bytes: PDF, fileName: 'our-terms.pdf' } });
    await issueAs(parties, { source: 'UPLOADED', amountRupees: 50_000 });

    const versions = await db.dealContract.findMany({ orderBy: { version: 'asc' } });
    expect(versions.map((version) => version.fileName)).toEqual(['our-terms.pdf', 'our-terms.pdf']);
    expect(versions[0]?.fileStorageKey).not.toBe(versions[1]?.fileStorageKey);
    expect(await ctx.fileStorage.get(versions[1]?.fileStorageKey ?? '')).toMatchObject({
      contentType: 'application/pdf',
    });
  });

  it('SR-9 an uploaded contract must be a clean PDF', async () => {
    const parties = await openDeal(ctx, db);
    const infected = { ...ctx, malwareScanner: { scan: async () => 'INFECTED' as const } };

    await expect(
      issueAs(parties, { source: 'UPLOADED', file: { bytes: PNG, fileName: 'terms.pdf' } }),
    ).rejects.toMatchObject({ fieldErrors: { file: 'contract.fileType' } });
    await expect(issueAs(parties, { source: 'UPLOADED' })).rejects.toMatchObject({
      fieldErrors: { file: 'contract.fileRequired' },
    });
    await expect(
      issueContract(infected, {
        userId: parties.brand.id,
        dealId: parties.dealId,
        amountRupees: 40_000,
        advancePercent: null,
        paymentDueOn: null,
        additionalTerms: '',
        source: 'UPLOADED',
        file: { bytes: PDF, fileName: 'terms.pdf' },
      }),
    ).rejects.toMatchObject({ fieldErrors: { file: 'contract.fileRejected' } });
    expect(await db.dealContract.count()).toBe(0);
  });
});

describe('proof of work and review (ADR-012)', () => {
  it('ADR-012 work cannot be submitted before both sides accept the contract', async () => {
    const parties = await openDeal(ctx, db);

    await expect(submitProof(parties)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await issueAs(parties);
    await expect(submitProof(parties)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(await db.dealSubmission.count()).toBe(0);
  });

  it('ADR-012 the brand asks for changes, then approves the next round; payment falls due', async () => {
    const parties = await openDeal(ctx, db);
    await signContract(ctx, parties);

    await submitProof(parties, { files: [{ bytes: PNG, fileName: 'insights.png' }] });
    const inReview = await getDeal(ctx, { userId: parties.brand.id, dealId: parties.dealId });
    expect(inReview.status).toBe('CONTENT_SUBMITTED');
    expect(inReview.reviewDueAt?.toISOString()).toBe('2026-10-16T10:00:00.000Z');
    // Terms are fixed while the brand reviews.
    await expect(issueAs(parties)).rejects.toMatchObject({ code: 'INVALID_STATE' });

    await requestChanges(ctx, {
      userId: parties.brand.id,
      dealId: parties.dealId,
      note: 'Please show the box in the first 3 seconds.',
    });
    await submitProof(parties, { note: 'Box is in the opening shot now' });
    await approveWork(ctx, { userId: parties.brand.id, dealId: parties.dealId });

    const approved = await getDeal(ctx, { userId: parties.creatorUser.id, dealId: parties.dealId });
    expect(approved).toMatchObject({
      status: 'APPROVED',
      reviewDueAt: null,
      changeRequestsLeft: 1,
    });
    expect(approved.paymentDueAt?.toISOString()).toBe('2026-10-16T10:00:00.000Z');
    expect(approved.submissions).toMatchObject([
      {
        round: 1,
        review: 'CHANGES_REQUESTED',
        reviewNote: 'Please show the box in the first 3 seconds.',
        files: [expect.objectContaining({ fileName: 'insights.png', contentType: 'image/png' })],
      },
      { round: 2, review: 'APPROVED', note: 'Box is in the opening shot now' },
    ]);
    await markDealPaid(ctx, { userId: parties.brand.id, dealId: parties.dealId });
  });

  it('ADR-012 the brand can ask for changes only as many times as the contract allows', async () => {
    const parties = await openDeal(ctx, db);
    await signContract(ctx, parties);
    const askForChanges = () =>
      requestChanges(ctx, { userId: parties.brand.id, dealId: parties.dealId, note: 'Try again' });

    for (let round = 0; round < 2; round += 1) {
      await submitProof(parties);
      await askForChanges();
    }
    await submitProof(parties);

    await expect(askForChanges()).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const view = await getDeal(ctx, { userId: parties.brand.id, dealId: parties.dealId });
    expect(view.allowedActions).toEqual(['APPROVE_WORK', 'RAISE_DISPUTE', 'CANCEL']);
  });

  it('ADR-012 work the brand does not review in 7 days is approved automatically', async () => {
    const parties = await openDeal(ctx, db);
    await signContract(ctx, parties);
    await submitProof(parties);

    ctx.clock.advance(6 * DAY_MS);
    expect(await autoApproveDueWork(ctx)).toEqual({ approved: 0 });
    ctx.clock.advance(DAY_MS);
    expect(await autoApproveDueWork(ctx)).toEqual({ approved: 1 });
    expect(await autoApproveDueWork(ctx)).toEqual({ approved: 0 });

    const deal = await getDeal(ctx, { userId: parties.brand.id, dealId: parties.dealId });
    expect(deal.status).toBe('APPROVED');
    expect(deal.submissions[0]?.review).toBe('AUTO_APPROVED');
    expect(deal.events.at(-1)).toMatchObject({ kind: 'WORK_AUTO_APPROVED', actorSide: null });
    const emails = await db.emailOutbox.findMany({ where: { template: 'workAutoApproved' } });
    expect(emails.map((email) => email.toAddress).sort()).toEqual([
      'creator@example.in',
      'owner@spiceco.in',
    ]);
  });

  it('ADR-012 proof needs a link or a file, and files must be safe images or PDFs', async () => {
    const parties = await openDeal(ctx, db);
    await signContract(ctx, parties);

    await expect(submitProof(parties, { links: [] })).rejects.toMatchObject({
      fieldErrors: { links: 'work.proofRequired' },
    });
    await expect(
      submitProof(parties, { files: [{ bytes: Buffer.from('MZ fake exe'), fileName: 'a.png' }] }),
    ).rejects.toMatchObject({ fieldErrors: { files: 'work.fileType' } });
    await expect(
      submitWork(
        { ...ctx, malwareScanner: { scan: async () => 'INFECTED' as const } },
        {
          userId: parties.creatorUser.id,
          dealId: parties.dealId,
          note: '',
          links: [],
          files: [{ bytes: PNG, fileName: 'shot.png' }],
        },
      ),
    ).rejects.toMatchObject({ fieldErrors: { files: 'work.fileRejected' } });
    expect(await db.dealSubmission.count()).toBe(0);
  });

  it('ADR-012 a dispute goes to the admins as a report, once per person', async () => {
    const parties = await openDeal(ctx, db);
    await signContract(ctx, parties);
    await submitProof(parties);
    const dispute = () =>
      raiseDealDispute(ctx, {
        userId: parties.creatorUser.id,
        dealId: parties.dealId,
        note: 'The brand keeps changing the brief.',
      });

    await dispute();

    expect(await db.report.findFirstOrThrow()).toMatchObject({
      targetType: 'DEAL',
      targetId: parties.dealId,
      reporterUserId: parties.creatorUser.id,
      status: 'OPEN',
    });
    await expect(dispute()).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(await db.emailOutbox.count({ where: { template: 'dealDisputed' } })).toBe(1);
  });
});

describe('contracts and privacy (PRV-2, PRV-4)', () => {
  it('PRV-2 the creator’s data export includes contracts and submissions', async () => {
    const parties = await openDeal(ctx, db);
    await signContract(ctx, parties);
    await submitProof(parties);

    const exported = await exportMyData(ctx, {
      userId: parties.creatorUser.id,
      request: { ipAddress: '203.0.113.5', userAgent: null, locale: 'en' },
    });

    const data = JSON.parse(exported.json) as {
      creatorProfile: { deals: { contracts: unknown[]; submissions: unknown[] }[] };
    };
    expect(data.creatorProfile.deals[0]?.contracts).toHaveLength(1);
    expect(data.creatorProfile.deals[0]?.submissions).toMatchObject([
      { round: 1, note: 'Draft is ready' },
    ]);
  });

  it('PRV-4 anonymising a person keeps the agreement for the other side but drops the link to them', async () => {
    const parties = await openDeal(ctx, db);
    await signContract(ctx, parties);
    await submitProof(parties);

    await ctx.repos.privacy.anonymiseUser(parties.creatorUser.id);

    const acceptance = await db.dealContractAcceptance.findFirstOrThrow({
      where: { side: 'CREATOR' },
    });
    expect(acceptance.userId).toBeNull();
    expect((await db.dealSubmission.findFirstOrThrow()).submittedByUserId).toBeNull();
    expect(await db.dealContract.count()).toBe(1);
  });
});
