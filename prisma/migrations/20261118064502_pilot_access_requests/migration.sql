-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED');

-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "city" TEXT,
    "profileUrl" TEXT,
    "locale" TEXT NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessRequest_email_key" ON "AccessRequest"("email");

-- CreateIndex
CREATE INDEX "AccessRequest_status_createdAt_idx" ON "AccessRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AccessRequest_createdAt_idx" ON "AccessRequest"("createdAt");

-- Only creators and brands can ask to join (hand-written).
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_role_not_admin" CHECK ("role" <> 'ADMIN');
