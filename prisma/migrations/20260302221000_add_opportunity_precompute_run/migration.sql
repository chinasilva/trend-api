-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "PrecomputeRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "OpportunityPrecomputeRun" (
    "id" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "bucketAt" TIMESTAMP(3) NOT NULL,
    "status" "PrecomputeRunStatus" NOT NULL DEFAULT 'RUNNING',
    "config" JSONB,
    "metrics" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityPrecomputeRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OpportunityPrecomputeRun_runKey_key" ON "OpportunityPrecomputeRun"("runKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OpportunityPrecomputeRun_bucketAt_idx" ON "OpportunityPrecomputeRun"("bucketAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OpportunityPrecomputeRun_status_createdAt_idx" ON "OpportunityPrecomputeRun"("status", "createdAt");
