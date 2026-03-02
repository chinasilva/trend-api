-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "AutoGenerateJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "AutoGenerateTriggerMode" AS ENUM ('MANUAL', 'SCHEDULED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "Account"
ADD COLUMN IF NOT EXISTS "autoGenerateEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "autoGenerateTime" TEXT,
ADD COLUMN IF NOT EXISTS "autoGenerateLeadMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN IF NOT EXISTS "autoGenerateTimezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
ADD COLUMN IF NOT EXISTS "lastAutoGenerateAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Opportunity"
ADD COLUMN IF NOT EXISTS "layeredScore" JSONB,
ADD COLUMN IF NOT EXISTS "personaFitScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "riskPrecheckScore" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Draft"
ADD COLUMN IF NOT EXISTS "synthesisReportId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TopicSynthesisReport" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "finalTopic" TEXT NOT NULL,
    "oneLiner" TEXT,
    "sourceItems" JSONB,
    "mergeRationale" JSONB,
    "selectionRationale" JSONB,
    "accountFitReason" TEXT,
    "traceScores" JSONB,
    "riskDowngradeTrace" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicSynthesisReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TopicResearch" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "synthesisReportId" TEXT NOT NULL,
    "querySet" JSONB,
    "sources" JSONB,
    "languageMix" TEXT NOT NULL DEFAULT 'mixed',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicResearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AutoGenerateJob" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "synthesisReportId" TEXT,
    "draftId" TEXT,
    "status" "AutoGenerateJobStatus" NOT NULL DEFAULT 'QUEUED',
    "triggerMode" "AutoGenerateTriggerMode" NOT NULL,
    "runKey" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoGenerateJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TopicSynthesisReport_accountId_createdAt_idx" ON "TopicSynthesisReport"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TopicResearch_accountId_createdAt_idx" ON "TopicResearch"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TopicResearch_synthesisReportId_idx" ON "TopicResearch"("synthesisReportId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AutoGenerateJob_runKey_key" ON "AutoGenerateJob"("runKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutoGenerateJob_accountId_status_createdAt_idx" ON "AutoGenerateJob"("accountId", "status", "createdAt");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "TopicSynthesisReport" ADD CONSTRAINT "TopicSynthesisReport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "TopicResearch" ADD CONSTRAINT "TopicResearch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "TopicResearch" ADD CONSTRAINT "TopicResearch_synthesisReportId_fkey" FOREIGN KEY ("synthesisReportId") REFERENCES "TopicSynthesisReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "AutoGenerateJob" ADD CONSTRAINT "AutoGenerateJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "AutoGenerateJob" ADD CONSTRAINT "AutoGenerateJob_synthesisReportId_fkey" FOREIGN KEY ("synthesisReportId") REFERENCES "TopicSynthesisReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "AutoGenerateJob" ADD CONSTRAINT "AutoGenerateJob_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "Draft" ADD CONSTRAINT "Draft_synthesisReportId_fkey" FOREIGN KEY ("synthesisReportId") REFERENCES "TopicSynthesisReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
