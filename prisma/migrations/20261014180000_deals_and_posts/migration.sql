-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('ACCEPTED', 'CONTENT_SUBMITTED', 'POSTED', 'PAYMENT_MARKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DealEventKind" AS ENUM ('CREATED', 'TERMS_UPDATED', 'CONTENT_SUBMITTED', 'POST_ADDED', 'PAYMENT_MARKED', 'PAYMENT_CONFIRMED', 'PAYMENT_DISPUTED', 'CANCELLED', 'DEADLINE_REMINDER', 'PAYMENT_REMINDER');

-- CreateEnum
CREATE TYPE "DealPostStatus" AS ENUM ('LIVE', 'DELETED', 'PRIVATE');

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'ACCEPTED',
    "agreedAmountMinor" INTEGER,
    "currencyCode" TEXT NOT NULL,
    "advancePercent" INTEGER,
    "paymentDueOn" DATE,
    "deadline" DATE NOT NULL,
    "postedAt" TIMESTAMP(3),
    "paymentMarkedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBySide" "CollabSide",
    "cancelReason" TEXT,
    "deadlineReminderSentAt" TIMESTAMP(3),
    "paymentReminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealEvent" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "kind" "DealEventKind" NOT NULL,
    "actorUserId" TEXT,
    "actorSide" "CollabSide",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealPost" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "socialAccountId" TEXT,
    "platform" "SocialPlatform" NOT NULL,
    "url" TEXT NOT NULL,
    "externalPostId" TEXT NOT NULL,
    "views" INTEGER,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "statsFetchedAt" TIMESTAMP(3),
    "status" "DealPostStatus" NOT NULL DEFAULT 'LIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deal_requestId_key" ON "Deal"("requestId");

-- CreateIndex
CREATE INDEX "Deal_brandId_status_idx" ON "Deal"("brandId", "status");

-- CreateIndex
CREATE INDEX "Deal_creatorId_status_idx" ON "Deal"("creatorId", "status");

-- CreateIndex
CREATE INDEX "Deal_campaignId_idx" ON "Deal"("campaignId");

-- CreateIndex
CREATE INDEX "Deal_status_deadline_idx" ON "Deal"("status", "deadline");

-- CreateIndex
CREATE INDEX "Deal_status_postedAt_idx" ON "Deal"("status", "postedAt");

-- CreateIndex
CREATE INDEX "DealEvent_dealId_createdAt_idx" ON "DealEvent"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "DealEvent_actorUserId_idx" ON "DealEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "DealPost_socialAccountId_idx" ON "DealPost"("socialAccountId");

-- CreateIndex
CREATE INDEX "DealPost_status_statsFetchedAt_idx" ON "DealPost"("status", "statsFetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DealPost_dealId_platform_externalPostId_key" ON "DealPost"("dealId", "platform", "externalPostId");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CollabRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealEvent" ADD CONSTRAINT "DealEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealEvent" ADD CONSTRAINT "DealEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealPost" ADD CONSTRAINT "DealPost_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealPost" ADD CONSTRAINT "DealPost_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

