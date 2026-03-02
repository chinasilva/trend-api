-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "RealtimeOpportunitySessionStatus" AS ENUM ('OPEN', 'CONSUMED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RealtimeOpportunitySession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "RealtimeOpportunitySessionStatus" NOT NULL DEFAULT 'OPEN',
    "windowConfig" JSONB,
    "topN" INTEGER NOT NULL DEFAULT 50,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RealtimeOpportunitySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RealtimeOpportunityItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "keywords" JSONB,
    "evidences" JSONB,
    "windowScores" JSONB,
    "reasons" JSONB,
    "weightedScore" DOUBLE PRECISION NOT NULL,
    "rank24h" INTEGER,
    "rank72h" INTEGER,
    "rank168h" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealtimeOpportunityItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RealtimeOpportunitySession_accountId_createdAt_idx" ON "RealtimeOpportunitySession"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RealtimeOpportunitySession_status_expiresAt_idx" ON "RealtimeOpportunitySession"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RealtimeOpportunityItem_sessionId_fingerprint_key" ON "RealtimeOpportunityItem"("sessionId", "fingerprint");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RealtimeOpportunityItem_sessionId_weightedScore_idx" ON "RealtimeOpportunityItem"("sessionId", "weightedScore");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "RealtimeOpportunitySession" ADD CONSTRAINT "RealtimeOpportunitySession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "RealtimeOpportunityItem" ADD CONSTRAINT "RealtimeOpportunityItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RealtimeOpportunitySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
