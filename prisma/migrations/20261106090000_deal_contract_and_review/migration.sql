-- CreateEnum
CREATE TYPE "ContractSource" AS ENUM ('GENERATED', 'UPLOADED');

-- CreateEnum
CREATE TYPE "SubmissionReview" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'AUTO_APPROVED');

-- AlterEnum
ALTER TYPE "DealEventKind" ADD VALUE 'CONTRACT_ISSUED';
ALTER TYPE "DealEventKind" ADD VALUE 'CONTRACT_ACCEPTED';
ALTER TYPE "DealEventKind" ADD VALUE 'CHANGES_REQUESTED';
ALTER TYPE "DealEventKind" ADD VALUE 'WORK_APPROVED';
ALTER TYPE "DealEventKind" ADD VALUE 'WORK_AUTO_APPROVED';
ALTER TYPE "DealEventKind" ADD VALUE 'DISPUTE_RAISED';

-- AlterEnum
-- ADR-012: "posted" becomes "approved" (work accepted, payment due). Renaming keeps every
-- existing deal; deals already posted carry on as approved.
ALTER TYPE "DealStatus" RENAME VALUE 'POSTED' TO 'APPROVED';
ALTER TYPE "DealStatus" ADD VALUE 'CHANGES_REQUESTED' AFTER 'CONTENT_SUBMITTED';

-- AlterEnum
ALTER TYPE "ReportTarget" ADD VALUE 'DEAL';

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "reviewDueAt" TIMESTAMP(3);

-- Deals that were posted: payment falls due from the posting date, as before.
UPDATE "Deal" SET "approvedAt" = "postedAt" WHERE "status" = 'APPROVED';

-- CreateTable
CREATE TABLE "DealContract" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" "ContractSource" NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "terms" JSONB NOT NULL,
    "additionalTerms" TEXT,
    "fileStorageKey" TEXT,
    "fileName" TEXT,
    "fileSizeBytes" INTEGER,
    "fingerprint" TEXT NOT NULL,
    "issuedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealContractAcceptance" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "side" "CollabSide" NOT NULL,
    "userId" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealContractAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealSubmission" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "links" TEXT[],
    "submittedByUserId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "review" "SubmissionReview" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealSubmissionFile" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealSubmissionFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealContract_fileStorageKey_key" ON "DealContract"("fileStorageKey");

-- CreateIndex
CREATE INDEX "DealContract_issuedByUserId_idx" ON "DealContract"("issuedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DealContract_dealId_version_key" ON "DealContract"("dealId", "version");

-- CreateIndex
CREATE INDEX "DealContractAcceptance_userId_idx" ON "DealContractAcceptance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DealContractAcceptance_contractId_side_key" ON "DealContractAcceptance"("contractId", "side");

-- CreateIndex
CREATE INDEX "DealSubmission_submittedByUserId_idx" ON "DealSubmission"("submittedByUserId");

-- CreateIndex
CREATE INDEX "DealSubmission_reviewedByUserId_idx" ON "DealSubmission"("reviewedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DealSubmission_dealId_round_key" ON "DealSubmission"("dealId", "round");

-- CreateIndex
CREATE UNIQUE INDEX "DealSubmissionFile_storageKey_key" ON "DealSubmissionFile"("storageKey");

-- CreateIndex
CREATE INDEX "DealSubmissionFile_submissionId_idx" ON "DealSubmissionFile"("submissionId");

-- CreateIndex
CREATE INDEX "Deal_status_approvedAt_idx" ON "Deal"("status", "approvedAt");

-- CreateIndex
CREATE INDEX "Deal_status_reviewDueAt_idx" ON "Deal"("status", "reviewDueAt");

-- AddForeignKey
ALTER TABLE "DealContract" ADD CONSTRAINT "DealContract_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealContract" ADD CONSTRAINT "DealContract_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealContractAcceptance" ADD CONSTRAINT "DealContractAcceptance_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "DealContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealContractAcceptance" ADD CONSTRAINT "DealContractAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealSubmission" ADD CONSTRAINT "DealSubmission_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealSubmission" ADD CONSTRAINT "DealSubmission_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealSubmission" ADD CONSTRAINT "DealSubmission_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealSubmissionFile" ADD CONSTRAINT "DealSubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DealSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

