-- DropIndex
DROP INDEX "Brand_emailDomain_idx";

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "hasHadTrial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trialEndedNoticeSentAt" TIMESTAMP(3),
ADD COLUMN     "trialEndingNoticeSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CollabRequest" ADD COLUMN     "creditPackId" TEXT;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "usesCreditPacks" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canonicalEmail" TEXT;

-- CreateTable
CREATE TABLE "CreditPack" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "priceMinor" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "addedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditPack_brandId_expiresAt_idx" ON "CreditPack"("brandId", "expiresAt");

-- CreateIndex
CREATE INDEX "Brand_emailDomain_hasHadTrial_idx" ON "Brand"("emailDomain", "hasHadTrial");

-- CreateIndex
CREATE INDEX "Brand_trialEndsAt_idx" ON "Brand"("trialEndsAt");

-- CreateIndex
CREATE INDEX "CollabRequest_creditPackId_idx" ON "CollabRequest"("creditPackId");

-- CreateIndex
CREATE INDEX "User_canonicalEmail_idx" ON "User"("canonicalEmail");

-- AddForeignKey
ALTER TABLE "CollabRequest" ADD CONSTRAINT "CollabRequest_creditPackId_fkey" FOREIGN KEY ("creditPackId") REFERENCES "CreditPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPack" ADD CONSTRAINT "CreditPack_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill (UC-B1): mailbox of existing users, with the same rules as
-- domain/email-address.ts canonicalMailbox (Gmail ignores dots; "+tags" are dropped).
UPDATE "User" SET "canonicalEmail" = CASE
  WHEN split_part("email", '@', 2) IN ('gmail.com', 'googlemail.com')
    THEN replace(split_part(split_part("email", '@', 1), '+', 1), '.', '') || '@gmail.com'
  ELSE split_part(split_part("email", '@', 1), '+', 1) || '@' || split_part("email", '@', 2)
END;

-- Brands that were ever given a trial end date had a trial.
UPDATE "Brand" SET "hasHadTrial" = true WHERE "trialEndsAt" IS NOT NULL;
