-- CreateEnum
CREATE TYPE "UsageRights" AS ENUM ('CREATOR_CHANNELS_ONLY', 'BRAND_ORGANIC', 'BRAND_PAID_ADS');

-- CreateEnum
CREATE TYPE "CollabRequestStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "BlockSide" AS ENUM ('CREATOR', 'BRAND');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollabRequest" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sentByUserId" TEXT,
    "brief" TEXT NOT NULL,
    "deliverables" JSONB NOT NULL,
    "budgetMinor" INTEGER,
    "currencyCode" TEXT NOT NULL,
    "deadline" DATE NOT NULL,
    "usageRights" "UsageRights" NOT NULL,
    "status" "CollabRequestStatus" NOT NULL DEFAULT 'OPEN',
    "openPairKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "declineReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollabRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "blockedBy" "BlockSide" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_brandId_name_key" ON "Campaign"("brandId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CollabRequest_openPairKey_key" ON "CollabRequest"("openPairKey");

-- CreateIndex
CREATE INDEX "CollabRequest_brandId_createdAt_idx" ON "CollabRequest"("brandId", "createdAt");

-- CreateIndex
CREATE INDEX "CollabRequest_brandId_status_idx" ON "CollabRequest"("brandId", "status");

-- CreateIndex
CREATE INDEX "CollabRequest_creatorId_status_createdAt_idx" ON "CollabRequest"("creatorId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CollabRequest_status_expiresAt_idx" ON "CollabRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "CollabRequest_campaignId_idx" ON "CollabRequest"("campaignId");

-- CreateIndex
CREATE INDEX "CollabRequest_sentByUserId_idx" ON "CollabRequest"("sentByUserId");

-- CreateIndex
CREATE INDEX "Block_brandId_idx" ON "Block"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Block_creatorId_brandId_blockedBy_key" ON "Block"("creatorId", "brandId", "blockedBy");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabRequest" ADD CONSTRAINT "CollabRequest_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabRequest" ADD CONSTRAINT "CollabRequest_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabRequest" ADD CONSTRAINT "CollabRequest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabRequest" ADD CONSTRAINT "CollabRequest_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

