-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('DIRECT', 'ESCROW');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('AWAITING_PAYMENT', 'FUNDED', 'RELEASE_PENDING', 'RELEASED', 'REFUND_PENDING', 'REFUNDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DealEventKind" ADD VALUE 'ESCROW_FUNDED';
ALTER TYPE "DealEventKind" ADD VALUE 'ESCROW_RELEASED';
ALTER TYPE "DealEventKind" ADD VALUE 'ESCROW_REFUNDED';

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'DIRECT';

-- CreateTable
CREATE TABLE "DealPayment" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "transferId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "feeMinor" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "status" "EscrowStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "fundedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutAccount" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "gatewayAccountId" TEXT NOT NULL,
    "bankLast4" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealPayment_dealId_key" ON "DealPayment"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "DealPayment_orderId_key" ON "DealPayment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DealPayment_paymentId_key" ON "DealPayment"("paymentId");

-- CreateIndex
CREATE INDEX "DealPayment_status_idx" ON "DealPayment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAccount_creatorId_key" ON "PayoutAccount"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAccount_gatewayAccountId_key" ON "PayoutAccount"("gatewayAccountId");

-- AddForeignKey
ALTER TABLE "DealPayment" ADD CONSTRAINT "DealPayment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

