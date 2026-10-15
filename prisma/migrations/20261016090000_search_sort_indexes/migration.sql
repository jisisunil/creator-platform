-- DropIndex
DROP INDEX "CreatorProfile_isSearchable_currentScore_idx";

-- DropIndex
DROP INDEX "CreatorProfile_isSearchable_engagementRateBp_idx";

-- DropIndex
DROP INDEX "CreatorProfile_isSearchable_growth90dBp_idx";

-- DropIndex
DROP INDEX "CreatorProfile_isSearchable_totalFollowers_idx";

-- CreateIndex
CREATE INDEX "CreatorProfile_countryCode_isSearchable_currentScore_id_idx" ON "CreatorProfile"("countryCode", "isSearchable", "currentScore" DESC, "id");

-- CreateIndex
CREATE INDEX "CreatorProfile_countryCode_isSearchable_engagementRateBp_id_idx" ON "CreatorProfile"("countryCode", "isSearchable", "engagementRateBp" DESC, "id");

-- CreateIndex
CREATE INDEX "CreatorProfile_countryCode_isSearchable_totalFollowers_id_idx" ON "CreatorProfile"("countryCode", "isSearchable", "totalFollowers" DESC, "id");

-- CreateIndex
-- NULLS LAST by hand: creators without 90 days of history sort after everyone else, and the
-- search orders the same way, so the index serves it (Prisma cannot express NULLS LAST).
CREATE INDEX "CreatorProfile_countryCode_isSearchable_growth90dBp_id_idx" ON "CreatorProfile"("countryCode", "isSearchable", "growth90dBp" DESC NULLS LAST, "id");
