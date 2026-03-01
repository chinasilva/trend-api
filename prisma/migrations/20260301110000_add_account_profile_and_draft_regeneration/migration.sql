-- CreateTable
CREATE TABLE "AccountProfile" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "growthGoal" TEXT NOT NULL DEFAULT 'read',
    "painPoints" JSONB,
    "contentPromise" TEXT,
    "forbiddenTopics" JSONB,
    "ctaStyle" TEXT,
    "preferredLength" INTEGER NOT NULL DEFAULT 1800,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountProfileVersion" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountProfileId" TEXT NOT NULL,
    "profileSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountProfileVersion_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN "parentDraftId" TEXT,
ADD COLUMN "regenerationIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "AccountProfile_accountId_key" ON "AccountProfile"("accountId");

-- CreateIndex
CREATE INDEX "AccountProfileVersion_accountId_createdAt_idx" ON "AccountProfileVersion"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountProfileVersion_accountProfileId_createdAt_idx" ON "AccountProfileVersion"("accountProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "Draft_parentDraftId_createdAt_idx" ON "Draft"("parentDraftId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountProfile" ADD CONSTRAINT "AccountProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountProfileVersion" ADD CONSTRAINT "AccountProfileVersion_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountProfileVersion" ADD CONSTRAINT "AccountProfileVersion_accountProfileId_fkey" FOREIGN KEY ("accountProfileId") REFERENCES "AccountProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_parentDraftId_fkey" FOREIGN KEY ("parentDraftId") REFERENCES "Draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
