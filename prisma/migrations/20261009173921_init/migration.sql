-- pgvector for future semantic search (CreatorEmbedding). No AI features use it yet.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "NumberFormat" AS ENUM ('INDIAN', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('YOUTUBE', 'INSTAGRAM');

-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('FREE_BETA', 'TRIAL', 'PAY_AS_YOU_GO', 'STARTER', 'PRO', 'AGENCY');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('NONE', 'MONTHLY');

-- CreateTable
CREATE TABLE "CountrySettings" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "numberFormat" "NumberFormat" NOT NULL,
    "defaultLocale" TEXT NOT NULL,
    "supportedLocales" TEXT[],
    "defaultTimezone" TEXT NOT NULL,
    "enabledPlatforms" "SocialPlatform"[],
    "dataRegion" TEXT NOT NULL,
    "privacyNoticeVersion" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountrySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Language" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nativeName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" "PlanCode" NOT NULL,
    "countryCode" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "billingPeriod" "BillingPeriod" NOT NULL,
    "contactRequestsPerPeriod" INTEGER NOT NULL,
    "seatLimit" INTEGER NOT NULL,
    "shortlistLimit" INTEGER NOT NULL,
    "profileViewsPerHour" INTEGER NOT NULL,
    "trialDays" INTEGER,
    "canSaveSearch" BOOLEAN NOT NULL,
    "canCompare" BOOLEAN NOT NULL,
    "canCampaignReports" BOOLEAN NOT NULL,
    "canCsvExport" BOOLEAN NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CountrySettings_code_key" ON "CountrySettings"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Language_code_key" ON "Language"("code");

-- CreateIndex
CREATE INDEX "Category_countryCode_idx" ON "Category"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "Category_countryCode_slug_key" ON "Category"("countryCode", "slug");

-- CreateIndex
CREATE INDEX "Plan_countryCode_idx" ON "Plan"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_countryCode_key" ON "Plan"("code", "countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSetting_key_key" ON "PlatformSetting"("key");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "CountrySettings"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "CountrySettings"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
