import type { EscrowStatus } from '@/domain/escrow';
import type { DbClient } from './db-client';

export interface PayoutAccountRecord {
  readonly creatorId: string;
  readonly gateway: string;
  readonly gatewayAccountId: string;
  readonly bankLast4: string;
  readonly createdAt: Date;
}

export interface DealPaymentRecord {
  readonly id: string;
  readonly dealId: string;
  readonly gateway: string;
  readonly orderId: string;
  readonly paymentId: string | null;
  readonly transferId: string | null;
  readonly amountMinor: number;
  readonly feeMinor: number;
  readonly currencyCode: string;
  readonly status: EscrowStatus;
  readonly isFrozen: boolean;
  readonly fundedAt: Date | null;
  readonly releasedAt: Date | null;
  readonly refundedAt: Date | null;
  readonly lastError: string | null;
}

const PAYMENT_SELECT = {
  id: true,
  dealId: true,
  gateway: true,
  orderId: true,
  paymentId: true,
  transferId: true,
  amountMinor: true,
  feeMinor: true,
  currencyCode: true,
  status: true,
  isFrozen: true,
  fundedAt: true,
  releasedAt: true,
  refundedAt: true,
  lastError: true,
} as const;

export type EscrowRepository = ReturnType<typeof createEscrowRepository>;

/** Creators' payout accounts and deals' held payments (ADR-013). */
export function createEscrowRepository(db: DbClient) {
  return {
    async findPayoutAccount(creatorId: string): Promise<PayoutAccountRecord | null> {
      return db.payoutAccount.findUnique({
        where: { creatorId },
        select: {
          creatorId: true,
          gateway: true,
          gatewayAccountId: true,
          bankLast4: true,
          createdAt: true,
        },
      });
    },

    /** False when the creator already has one (one payout account per creator). */
    async addPayoutAccount(data: {
      creatorId: string;
      gateway: string;
      gatewayAccountId: string;
      bankLast4: string;
      createdAt: Date;
    }): Promise<boolean> {
      const result = await db.payoutAccount.createMany({ data: [data], skipDuplicates: true });
      return result.count === 1;
    },

    async findPaymentForDeal(dealId: string): Promise<DealPaymentRecord | null> {
      return db.dealPayment.findUnique({ where: { dealId }, select: PAYMENT_SELECT });
    },

    async findPaymentByOrder(orderId: string): Promise<DealPaymentRecord | null> {
      return db.dealPayment.findUnique({ where: { orderId }, select: PAYMENT_SELECT });
    },

    /**
     * The deal's order waiting for the brand's payment: replaced when the amount changed,
     * kept once paid (only an unpaid order is ever replaced).
     */
    async upsertAwaitingPayment(data: {
      dealId: string;
      gateway: string;
      orderId: string;
      amountMinor: number;
      feeMinor: number;
      currencyCode: string;
    }): Promise<boolean> {
      const existing = await db.dealPayment.findUnique({
        where: { dealId: data.dealId },
        select: { status: true },
      });
      if (existing && existing.status !== 'AWAITING_PAYMENT') return false;
      await db.dealPayment.upsert({
        where: { dealId: data.dealId },
        create: data,
        update: { ...data, paymentId: null, lastError: null },
      });
      return true;
    },

    /** Marks the order paid; false when it already was (a checkout and a webhook both arrive). */
    async markFunded(orderId: string, paymentId: string, at: Date): Promise<boolean> {
      const result = await db.dealPayment.updateMany({
        where: { orderId, status: 'AWAITING_PAYMENT' },
        data: { status: 'FUNDED', paymentId, fundedAt: at },
      });
      return result.count === 1;
    },

    /** Moves a payment between statuses only if it is still in `from` (compare and set). */
    async moveStatus(
      dealId: string,
      from: readonly EscrowStatus[],
      to: EscrowStatus,
      changes: {
        transferId?: string;
        releasedAt?: Date;
        refundedAt?: Date;
        isFrozen?: boolean;
        lastError?: string | null;
      } = {},
    ): Promise<boolean> {
      const result = await db.dealPayment.updateMany({
        where: { dealId, status: { in: [...from] } },
        data: { ...changes, status: to },
      });
      return result.count === 1;
    },

    async setFrozen(dealId: string, isFrozen: boolean): Promise<void> {
      await db.dealPayment.updateMany({ where: { dealId }, data: { isFrozen } });
    },

    async recordError(dealId: string, message: string): Promise<void> {
      await db.dealPayment.updateMany({ where: { dealId }, data: { lastError: message } });
    },

    /** Releases and refunds that didn't finish (the gateway was down), oldest first. */
    async pendingSettlements(limit: number): Promise<DealPaymentRecord[]> {
      return db.dealPayment.findMany({
        where: { status: { in: ['RELEASE_PENDING', 'REFUND_PENDING'] } },
        orderBy: { updatedAt: 'asc' },
        take: limit,
        select: PAYMENT_SELECT,
      });
    },
  };
}
