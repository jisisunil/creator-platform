-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "raterSide" "CollabSide" NOT NULL,
    "raterUserId" TEXT,
    "scores" JSONB NOT NULL,
    "averageTenths" INTEGER NOT NULL,
    "comment" TEXT,
    "visibleFrom" TIMESTAMP(3) NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rating_raterUserId_idx" ON "Rating"("raterUserId");

-- CreateIndex
CREATE INDEX "Rating_raterSide_visibleFrom_idx" ON "Rating"("raterSide", "visibleFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_dealId_raterSide_key" ON "Rating"("dealId", "raterSide");

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_raterUserId_fkey" FOREIGN KEY ("raterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

