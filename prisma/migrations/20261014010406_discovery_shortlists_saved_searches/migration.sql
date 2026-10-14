-- DropIndex
DROP INDEX "CreatorEmbedding_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "CreatorProfile" ADD COLUMN     "growth90dBp" INTEGER;

-- CreateTable
CREATE TABLE "Shortlist" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSharedWithTeam" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shortlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortlistItem" (
    "id" TEXT NOT NULL,
    "shortlistId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "filtersVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileView" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "viewerBrandId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shortlist_brandId_idx" ON "Shortlist"("brandId");

-- CreateIndex
CREATE INDEX "Shortlist_createdByUserId_idx" ON "Shortlist"("createdByUserId");

-- CreateIndex
CREATE INDEX "ShortlistItem_creatorId_idx" ON "ShortlistItem"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "ShortlistItem_shortlistId_creatorId_key" ON "ShortlistItem"("shortlistId", "creatorId");

-- CreateIndex
CREATE INDEX "SavedSearch_brandId_idx" ON "SavedSearch"("brandId");

-- CreateIndex
CREATE INDEX "SavedSearch_createdByUserId_idx" ON "SavedSearch"("createdByUserId");

-- CreateIndex
CREATE INDEX "ProfileView_viewerBrandId_viewedAt_idx" ON "ProfileView"("viewerBrandId", "viewedAt");

-- CreateIndex
CREATE INDEX "ProfileView_creatorId_viewedAt_idx" ON "ProfileView"("creatorId", "viewedAt");

-- CreateIndex
CREATE INDEX "CreatorProfile_isSearchable_engagementRateBp_idx" ON "CreatorProfile"("isSearchable", "engagementRateBp");

-- CreateIndex
CREATE INDEX "CreatorProfile_isSearchable_totalFollowers_idx" ON "CreatorProfile"("isSearchable", "totalFollowers");

-- CreateIndex
CREATE INDEX "CreatorProfile_isSearchable_growth90dBp_idx" ON "CreatorProfile"("isSearchable", "growth90dBp");

-- AddForeignKey
ALTER TABLE "Shortlist" ADD CONSTRAINT "Shortlist_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shortlist" ADD CONSTRAINT "Shortlist_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistItem" ADD CONSTRAINT "ShortlistItem_shortlistId_fkey" FOREIGN KEY ("shortlistId") REFERENCES "Shortlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistItem" ADD CONSTRAINT "ShortlistItem_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_viewerBrandId_fkey" FOREIGN KEY ("viewerBrandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FR-5.2 text search on name and bio: trigram indexes make case-insensitive "contains"
-- (ILIKE '%term%') fast at 500k creators (ADR-005), for any script, not only English.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "CreatorProfile_displayName_trgm_idx"
  ON "CreatorProfile" USING gin ("displayName" gin_trgm_ops);
CREATE INDEX "CreatorProfile_bio_trgm_idx"
  ON "CreatorProfile" USING gin ("bio" gin_trgm_ops);
