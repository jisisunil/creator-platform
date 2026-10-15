-- NFR-1 (500k load test, ADR-005): filters that the search could not answer from an index.

-- City matches ignore case and still use the (countryCode, stateCode, city) index.
CREATE EXTENSION IF NOT EXISTS citext;
ALTER TABLE "CreatorProfile" ALTER COLUMN "city" SET DATA TYPE CITEXT;

-- DropIndex
DROP INDEX "SocialAccount_creatorId_idx";

-- CreateIndex
CREATE INDEX "AudienceSegment_dimension_bucket_sharePermille_socialAccoun_idx" ON "AudienceSegment"("dimension", "bucket", "sharePermille", "socialAccountId");

-- CreateIndex
CREATE INDEX "SocialAccount_creatorId_platform_status_idx" ON "SocialAccount"("creatorId", "platform", "status");
