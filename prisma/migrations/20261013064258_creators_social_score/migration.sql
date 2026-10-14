-- CreateEnum
CREATE TYPE "CreatorTier" AS ENUM ('NANO', 'MICRO', 'MID', 'MACRO', 'MEGA');

-- CreateEnum
CREATE TYPE "Deliverable" AS ENUM ('REEL', 'STORY', 'VIDEO', 'POST');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('ACTIVE', 'TOKEN_REVOKED', 'PRIVATE', 'DELETED');

-- CreateEnum
CREATE TYPE "AudienceDimension" AS ENUM ('AGE', 'GENDER', 'CITY');

-- CreateEnum
CREATE TYPE "AuthenticityFlagType" AS ENUM ('FOLLOWER_SPIKE', 'LOW_VIEWS_RATIO', 'ABNORMAL_ENGAGEMENT');

-- CreateEnum
CREATE TYPE "AuthenticityFlagStatus" AS ENUM ('OPEN', 'CLEARED', 'SUSPICIOUS');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "CreatorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "photoKey" TEXT,
    "city" TEXT NOT NULL DEFAULT '',
    "stateCode" TEXT NOT NULL DEFAULT '',
    "countryCode" TEXT NOT NULL,
    "isOpenToCollaborations" BOOLEAN NOT NULL DEFAULT true,
    "isSearchable" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "tier" "CreatorTier",
    "totalFollowers" INTEGER NOT NULL DEFAULT 0,
    "engagementRateBp" INTEGER NOT NULL DEFAULT 0,
    "currentScore" INTEGER,
    "scoreUpdatedAt" TIMESTAMP(3),
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorLanguage" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorCategory" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCardItem" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "deliverable" "Deliverable" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateCardItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "collaboratedOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "isFollowerCountHidden" BOOLEAN NOT NULL DEFAULT false,
    "lastRefreshedAt" TIMESTAMP(3),
    "lastRefreshError" TEXT,
    "nextRefreshAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatsSnapshot" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "capturedOn" DATE NOT NULL,
    "followers" INTEGER NOT NULL,
    "mediaCount" INTEGER NOT NULL,
    "posts30d" INTEGER NOT NULL,
    "views30d" INTEGER,
    "likes30d" INTEGER NOT NULL,
    "comments30d" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceSegment" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "dimension" "AudienceDimension" NOT NULL,
    "bucket" TEXT NOT NULL,
    "sharePermille" INTEGER NOT NULL,
    "capturedOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreResult" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "components" JSONB NOT NULL,
    "weightsVersion" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthenticityFlag" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "type" "AuthenticityFlagType" NOT NULL,
    "details" JSONB NOT NULL,
    "status" "AuthenticityFlagStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthenticityFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnershipDispute" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "claimantUserId" TEXT NOT NULL,
    "isClaimVerified" BOOLEAN NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnershipDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingSocialConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "accounts" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingSocialConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorEmbedding" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "embedding" vector(1024),
    "sourceText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_userId_key" ON "CreatorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_slug_key" ON "CreatorProfile"("slug");

-- CreateIndex
CREATE INDEX "CreatorProfile_countryCode_stateCode_city_idx" ON "CreatorProfile"("countryCode", "stateCode", "city");

-- CreateIndex
CREATE INDEX "CreatorProfile_isSearchable_currentScore_idx" ON "CreatorProfile"("isSearchable", "currentScore");

-- CreateIndex
CREATE INDEX "CreatorProfile_tier_idx" ON "CreatorProfile"("tier");

-- CreateIndex
CREATE INDEX "CreatorProfile_totalFollowers_idx" ON "CreatorProfile"("totalFollowers");

-- CreateIndex
CREATE INDEX "CreatorProfile_engagementRateBp_idx" ON "CreatorProfile"("engagementRateBp");

-- CreateIndex
CREATE INDEX "CreatorProfile_isVerified_idx" ON "CreatorProfile"("isVerified");

-- CreateIndex
CREATE INDEX "CreatorProfile_isOpenToCollaborations_idx" ON "CreatorProfile"("isOpenToCollaborations");

-- CreateIndex
CREATE INDEX "CreatorLanguage_languageCode_idx" ON "CreatorLanguage"("languageCode");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorLanguage_creatorId_languageCode_key" ON "CreatorLanguage"("creatorId", "languageCode");

-- CreateIndex
CREATE INDEX "CreatorCategory_categoryId_idx" ON "CreatorCategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorCategory_creatorId_categoryId_key" ON "CreatorCategory"("creatorId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "RateCardItem_creatorId_deliverable_key" ON "RateCardItem"("creatorId", "deliverable");

-- CreateIndex
CREATE INDEX "PortfolioItem_creatorId_idx" ON "PortfolioItem"("creatorId");

-- CreateIndex
CREATE INDEX "SocialAccount_creatorId_idx" ON "SocialAccount"("creatorId");

-- CreateIndex
CREATE INDEX "SocialAccount_status_nextRefreshAt_idx" ON "SocialAccount"("status", "nextRefreshAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_platform_externalId_key" ON "SocialAccount"("platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "StatsSnapshot_socialAccountId_capturedOn_key" ON "StatsSnapshot"("socialAccountId", "capturedOn");

-- CreateIndex
CREATE UNIQUE INDEX "AudienceSegment_socialAccountId_dimension_bucket_key" ON "AudienceSegment"("socialAccountId", "dimension", "bucket");

-- CreateIndex
CREATE INDEX "ScoreResult_creatorId_computedAt_idx" ON "ScoreResult"("creatorId", "computedAt");

-- CreateIndex
CREATE INDEX "AuthenticityFlag_status_createdAt_idx" ON "AuthenticityFlag"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AuthenticityFlag_creatorId_type_idx" ON "AuthenticityFlag"("creatorId", "type");

-- CreateIndex
CREATE INDEX "OwnershipDispute_status_createdAt_idx" ON "OwnershipDispute"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OwnershipDispute_socialAccountId_idx" ON "OwnershipDispute"("socialAccountId");

-- CreateIndex
CREATE INDEX "OwnershipDispute_claimantUserId_idx" ON "OwnershipDispute"("claimantUserId");

-- CreateIndex
CREATE INDEX "PendingSocialConnection_userId_idx" ON "PendingSocialConnection"("userId");

-- CreateIndex
CREATE INDEX "PendingSocialConnection_expiresAt_idx" ON "PendingSocialConnection"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorEmbedding_creatorId_model_version_key" ON "CreatorEmbedding"("creatorId", "model", "version");

-- AddForeignKey
ALTER TABLE "CreatorProfile" ADD CONSTRAINT "CreatorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorProfile" ADD CONSTRAINT "CreatorProfile_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "CountrySettings"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorLanguage" ADD CONSTRAINT "CreatorLanguage_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorLanguage" ADD CONSTRAINT "CreatorLanguage_languageCode_fkey" FOREIGN KEY ("languageCode") REFERENCES "Language"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorCategory" ADD CONSTRAINT "CreatorCategory_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorCategory" ADD CONSTRAINT "CreatorCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCardItem" ADD CONSTRAINT "RateCardItem_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatsSnapshot" ADD CONSTRAINT "StatsSnapshot_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceSegment" ADD CONSTRAINT "AudienceSegment_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreResult" ADD CONSTRAINT "ScoreResult_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthenticityFlag" ADD CONSTRAINT "AuthenticityFlag_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipDispute" ADD CONSTRAINT "OwnershipDispute_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipDispute" ADD CONSTRAINT "OwnershipDispute_claimantUserId_fkey" FOREIGN KEY ("claimantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingSocialConnection" ADD CONSTRAINT "PendingSocialConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorEmbedding" ADD CONSTRAINT "CreatorEmbedding_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Approximate nearest-neighbour index for future semantic search (cosine distance).
-- The table stays empty until an embedding provider is chosen; no AI features use it yet.
CREATE INDEX "CreatorEmbedding_embedding_hnsw_idx"
  ON "CreatorEmbedding" USING hnsw ("embedding" vector_cosine_ops);
