-- AlterTable
ALTER TABLE "User" ADD COLUMN     "inactivityWarnedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_status_lastLoginAt_idx" ON "User"("status", "lastLoginAt");

