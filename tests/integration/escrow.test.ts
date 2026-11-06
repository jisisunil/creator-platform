import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { fakePaymentGateway, signFakeWebhook } from '@/adapters/payments/fake-payment-gateway';
import { type PaymentGateway, PaymentGatewayError } from '@/adapters/payments/payment-gateway';
import {
  approveWork,
  autoApproveDueWork,
  cancelDeal,
  confirmEscrowFunding,
  getDeal,
  issueContract,
  markDealPaid,
  raiseDealDispute,
  recordCapturedPayment,
  resolveEscrowDispute,
  settlePendingEscrow,
  setUpPayoutAccount,
  startEscrowFunding,
  submitWork,
} from '@/services/deals';
import { exportMyData } from '@/services/privacy';
import { createAdmin } from './admin-fixtures';
import { openDeal, signContract } from './collaboration-fixtures';
import { createBrandOwner } from './discovery-fixtures';
import { createTestDatabaseClient } from './test-database';
import { createTestContext, resetDatabase, type TestContext } from './test-context';

const DAY_MS = 86_400_000;
const REQUEST = { ipAddress: '203.0.113.9', userAgent: null, locale: 'en' };
const PAYOUT_DETAILS = {
  legalName: 'Asha Rao',
  pan: 'ABCDE1234F',
  phone: '9876543210',
  accountHolderName: 'Asha Rao',
  accountNumber: '123456789012',
  ifsc: 'HDFC0001234',
};
const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = { ...createTestContext(db), paymentGateway: fakePaymentGateway };
});
afterAll(() => db.$disconnect());

type Parties = Awaited<ReturnType<typeof openDeal>>;

/** An escrow deal with a signed contract (₹25,000) and the creator's payout account. */
async function readyDeal(): Promise<Parties> {
  const parties = await openDeal(ctx, db);
  await signContract(ctx, parties);
  await setUpPayoutAccount(ctx, { userId: parties.creatorUser.id, ...PAYOUT_DETAILS });
  return parties;
}

/** The brand pays in through the (fake) checkout. */
async function fund(parties: Parties): Promise<void> {
  const { checkout } = await startEscrowFunding(ctx, {
    userId: parties.brand.id,
    dealId: parties.dealId,
  });
  if (checkout.kind !== 'fake') throw new Error('tests use the fake gateway');
  await confirmEscrowFunding(ctx, {
    userId: parties.brand.id,
    dealId: parties.dealId,
    ...checkout,
  });
}

function submitProof(parties: Parties) {
  return submitWork(ctx, {
    userId: parties.creatorUser.id,
    dealId: parties.dealId,
    note: '',
    links: ['https://example.com/reel'],
    files: [],
  });
}

const paymentOf = (dealId: string) => db.dealPayment.findUniqueOrThrow({ where: { dealId } });

describe('escrow (ADR-013)', () => {
  it('ADR-013 holds the brand’s payment, then pays the creator when the work is approved', async () => {
    const parties = await readyDeal();

    const start = await startEscrowFunding(ctx, {
      userId: parties.brand.id,
      dealId: parties.dealId,
    });
    expect(start).toMatchObject({
      amountMinor: 2_500_000,
      feeMinor: 59_000,
      chargedMinor: 2_559_000,
    });
    if (start.checkout.kind !== 'fake') throw new Error('fake gateway expected');
    await confirmEscrowFunding(ctx, {
      userId: parties.brand.id,
      dealId: parties.dealId,
      ...start.checkout,
    });
    expect((await paymentOf(parties.dealId)).status).toBe('FUNDED');

    await submitProof(parties);
    await approveWork(ctx, { userId: parties.brand.id, dealId: parties.dealId });

    const deal = await getDeal(ctx, { userId: parties.brand.id, dealId: parties.dealId });
    expect(deal.status).toBe('COMPLETED');
    expect(deal.escrow?.payment).toMatchObject({
      status: 'RELEASED',
      transferId: expect.any(String),
    });
    expect(deal.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(['ESCROW_FUNDED', 'WORK_APPROVED', 'ESCROW_RELEASED']),
    );
    expect(await db.emailOutbox.count({ where: { template: 'escrowFunded' } })).toBe(1);
    expect(await db.emailOutbox.count({ where: { template: 'escrowReleased' } })).toBe(1);
    expect(await db.emailOutbox.count({ where: { template: 'ratingRequested' } })).toBe(2);
  });

  it('ADR-013 work waits for the payment; payment waits for the contract and payout account', async () => {
    const parties = await openDeal(ctx, db);
    const tryFunding = () =>
      startEscrowFunding(ctx, { userId: parties.brand.id, dealId: parties.dealId });

    await expect(tryFunding()).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await signContract(ctx, parties);
    await expect(tryFunding()).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(submitProof(parties)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await setUpPayoutAccount(ctx, { userId: parties.creatorUser.id, ...PAYOUT_DETAILS });
    await fund(parties);

    // The amount is fixed once paid in, and nobody marks an escrow deal paid by hand.
    await expect(
      issueContract(ctx, {
        userId: parties.brand.id,
        dealId: parties.dealId,
        amountRupees: 1,
        advancePercent: null,
        paymentDueOn: null,
        additionalTerms: '',
        source: 'GENERATED',
        file: null,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await submitProof(parties);
    await approveWork(ctx, { userId: parties.brand.id, dealId: parties.dealId });
    await expect(
      markDealPaid(ctx, { userId: parties.brand.id, dealId: parties.dealId }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('SEC-2 a forged payment confirmation is refused and logged', async () => {
    const parties = await readyDeal();
    const { checkout } = await startEscrowFunding(ctx, {
      userId: parties.brand.id,
      dealId: parties.dealId,
    });

    await expect(
      confirmEscrowFunding(ctx, {
        userId: parties.brand.id,
        dealId: parties.dealId,
        orderId: checkout.orderId,
        paymentId: 'pay_forged',
        signature: '0'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });

    expect((await paymentOf(parties.dealId)).status).toBe('AWAITING_PAYMENT');
    expect(await db.auditEvent.count({ where: { action: 'payment.signature-rejected' } })).toBe(1);
  });

  it('ADR-013 a webhook and the checkout both reporting the payment count once', async () => {
    const parties = await readyDeal();
    const { checkout } = await startEscrowFunding(ctx, {
      userId: parties.brand.id,
      dealId: parties.dealId,
    });
    if (checkout.kind !== 'fake') throw new Error('fake gateway expected');
    const body = JSON.stringify({ orderId: checkout.orderId, paymentId: checkout.paymentId });
    const event = fakePaymentGateway.readWebhook(body, signFakeWebhook(body));
    if (event.kind !== 'captured') throw new Error('expected a captured payment');

    await recordCapturedPayment(ctx, event);
    await confirmEscrowFunding(ctx, {
      userId: parties.brand.id,
      dealId: parties.dealId,
      ...checkout,
    });

    expect(await db.dealEvent.count({ where: { kind: 'ESCROW_FUNDED' } })).toBe(1);
    expect(fakePaymentGateway.readWebhook(body, 'forged')).toEqual({ kind: 'invalid' });
  });

  it('ADR-013 cancelling before any work refunds the brand; after work it needs an admin', async () => {
    const first = await readyDeal();
    await fund(first);

    await cancelDeal(ctx, { userId: first.brand.id, dealId: first.dealId, reason: 'Budget cut' });

    expect(await paymentOf(first.dealId)).toMatchObject({ status: 'REFUNDED' });
    expect(await db.emailOutbox.count({ where: { template: 'escrowRefunded' } })).toBe(1);

    await resetDatabase(db);
    const second = await readyDeal();
    await fund(second);
    await submitProof(second);
    await expect(
      cancelDeal(ctx, { userId: second.brand.id, dealId: second.dealId, reason: 'Changed mind' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect((await paymentOf(second.dealId)).status).toBe('FUNDED');
  });

  it('ADR-013 a dispute stops automatic release; the brand’s approval still pays out', async () => {
    const parties = await readyDeal();
    await fund(parties);
    await submitProof(parties);
    await raiseDealDispute(ctx, {
      userId: parties.creatorUser.id,
      dealId: parties.dealId,
      note: 'The brand is asking for work outside the brief.',
    });

    ctx.clock.advance(8 * DAY_MS);
    expect(await autoApproveDueWork(ctx)).toEqual({ approved: 0 });
    expect(await paymentOf(parties.dealId)).toMatchObject({ status: 'FUNDED', isFrozen: true });

    await approveWork(ctx, { userId: parties.brand.id, dealId: parties.dealId });
    expect(await paymentOf(parties.dealId)).toMatchObject({ status: 'RELEASED', isFrozen: false });
  });

  it('ADR-013 automatic approval releases an undisputed payment', async () => {
    const parties = await readyDeal();
    await fund(parties);
    await submitProof(parties);

    ctx.clock.advance(7 * DAY_MS);
    await autoApproveDueWork(ctx);

    expect((await paymentOf(parties.dealId)).status).toBe('RELEASED');
    const deal = await db.deal.findUniqueOrThrow({ where: { id: parties.dealId } });
    expect(deal.status).toBe('COMPLETED');
  });

  it('UC-M1 an admin settles a disputed escrow deal by refunding the brand', async () => {
    const parties = await readyDeal();
    await fund(parties);
    await submitProof(parties);
    await raiseDealDispute(ctx, {
      userId: parties.brand.id,
      dealId: parties.dealId,
      note: 'Nothing was delivered as agreed.',
    });
    const report = await db.report.findFirstOrThrow();
    const admin = await createAdmin(ctx);
    const settle = (adminUserId: string) =>
      resolveEscrowDispute(ctx, {
        adminUserId,
        request: REQUEST,
        dealId: parties.dealId,
        reportId: report.id,
        outcome: 'REFUND',
        reason: 'Proof did not match the brief',
      });

    await expect(settle(parties.brand.id)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await settle(admin.id);

    expect((await paymentOf(parties.dealId)).status).toBe('REFUNDED');
    expect((await db.deal.findUniqueOrThrow({ where: { id: parties.dealId } })).status).toBe(
      'CANCELLED',
    );
    expect(await db.report.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({
      status: 'RESOLVED',
      resolution: 'Proof did not match the brief',
    });
    expect(await db.auditEvent.count({ where: { action: 'escrow.refund' } })).toBe(1);
  });

  it('ADR-013 a release the gateway can’t finish is retried by the hourly job', async () => {
    const parties = await readyDeal();
    await fund(parties);
    await submitProof(parties);
    const down: PaymentGateway = {
      ...fakePaymentGateway,
      releaseTransfer: async () => {
        throw new PaymentGatewayError('TRANSIENT', 'gateway timeout');
      },
    };

    await approveWork(
      { ...ctx, paymentGateway: down },
      {
        userId: parties.brand.id,
        dealId: parties.dealId,
      },
    );
    expect(await paymentOf(parties.dealId)).toMatchObject({
      status: 'RELEASE_PENDING',
      lastError: 'gateway timeout',
    });
    expect((await db.deal.findUniqueOrThrow({ where: { id: parties.dealId } })).status).toBe(
      'APPROVED',
    );

    expect(await settlePendingEscrow(ctx)).toEqual({ released: 1, refunded: 0, stillPending: 0 });
    expect(await paymentOf(parties.dealId)).toMatchObject({ status: 'RELEASED', lastError: null });
    expect((await db.deal.findUniqueOrThrow({ where: { id: parties.dealId } })).status).toBe(
      'COMPLETED',
    );
  });

  it('SR-5 only the deal’s brand can pay in', async () => {
    const parties = await readyDeal();
    const otherBrand = await createBrandOwner(ctx, db, 'intruder@other.in');

    await expect(
      startEscrowFunding(ctx, { userId: otherBrand.id, dealId: parties.dealId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      startEscrowFunding(ctx, { userId: parties.creatorUser.id, dealId: parties.dealId }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('ADR-013 deals opened while payments were off stay direct', async () => {
    const parties = await openDeal({ ...ctx, paymentGateway: null }, db);
    await signContract(ctx, parties);
    await setUpPayoutAccount(ctx, { userId: parties.creatorUser.id, ...PAYOUT_DETAILS });

    await expect(
      startEscrowFunding(ctx, { userId: parties.brand.id, dealId: parties.dealId }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(
      (await getDeal(ctx, { userId: parties.brand.id, dealId: parties.dealId })).escrow,
    ).toBeNull();
  });
});

describe('payout accounts (ADR-013, PR-1)', () => {
  it('PR-1 keeps only the gateway account id and the last 4 digits', async () => {
    const parties = await openDeal(ctx, db);

    await setUpPayoutAccount(ctx, { userId: parties.creatorUser.id, ...PAYOUT_DETAILS });

    const account = await db.payoutAccount.findFirstOrThrow();
    expect(account).toMatchObject({ gateway: 'fake', bankLast4: '9012' });
    const everything = JSON.stringify(account);
    expect(everything).not.toContain(PAYOUT_DETAILS.pan);
    expect(everything).not.toContain(PAYOUT_DETAILS.accountNumber);
    const audits = JSON.stringify(await db.auditEvent.findMany());
    expect(audits).not.toContain(PAYOUT_DETAILS.pan);
    await expect(
      setUpPayoutAccount(ctx, { userId: parties.creatorUser.id, ...PAYOUT_DETAILS }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('ADR-013 a gateway refusal is shown as a form error', async () => {
    const parties = await openDeal(ctx, db);
    const refusing: PaymentGateway = {
      ...fakePaymentGateway,
      createPayoutAccount: async () => {
        throw new PaymentGatewayError('REJECTED', 'Invalid PAN');
      },
    };

    await expect(
      setUpPayoutAccount(
        { ...ctx, paymentGateway: refusing },
        { userId: parties.creatorUser.id, ...PAYOUT_DETAILS },
      ),
    ).rejects.toMatchObject({ fieldErrors: { details: 'payout.rejected' } });
    expect(await db.payoutAccount.count()).toBe(0);
  });

  it('PRV-2 PRV-4 the export shows the payout account; deletion removes it', async () => {
    const parties = await openDeal(ctx, db);
    await setUpPayoutAccount(ctx, { userId: parties.creatorUser.id, ...PAYOUT_DETAILS });

    const exported = await exportMyData(ctx, { userId: parties.creatorUser.id, request: REQUEST });
    expect(exported.json).toContain('"bankLast4": "9012"');

    await ctx.repos.privacy.anonymiseUser(parties.creatorUser.id);
    expect(await db.payoutAccount.count()).toBe(0);
  });
});
