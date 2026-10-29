-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "isSelfReported" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "selfReportedFollowers" INTEGER;

