-- AlterTable
ALTER TABLE "AuthenticityFlag" ADD COLUMN     "appealText" TEXT,
ADD COLUMN     "appealedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ChatAccessGrant" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "reportId" TEXT,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatAccessGrant_adminUserId_createdAt_idx" ON "ChatAccessGrant"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatAccessGrant_threadId_idx" ON "ChatAccessGrant"("threadId");

-- AddForeignKey
ALTER TABLE "ChatAccessGrant" ADD CONSTRAINT "ChatAccessGrant_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAccessGrant" ADD CONSTRAINT "ChatAccessGrant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

