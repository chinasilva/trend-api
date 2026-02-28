-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."Content" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "description" TEXT,
    "thumbnail" TEXT,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Snapshot" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "hotValue" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Trend" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hotValue" INTEGER,
    "url" TEXT,
    "description" TEXT,
    "rank" INTEGER NOT NULL,
    "thumbnail" TEXT,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TrendSource" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Content_sourceId_title_url_key" ON "public"."Content"("sourceId" ASC, "title" ASC, "url" ASC);

-- CreateIndex
CREATE INDEX "Snapshot_contentId_createdAt_idx" ON "public"."Snapshot"("contentId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Snapshot_createdAt_idx" ON "public"."Snapshot"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "Trend_createdAt_idx" ON "public"."Trend"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "Trend_sourceId_rank_idx" ON "public"."Trend"("sourceId" ASC, "rank" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Trend_sourceId_title_url_key" ON "public"."Trend"("sourceId" ASC, "title" ASC, "url" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TrendSource_platform_key" ON "public"."TrendSource"("platform" ASC);

-- AddForeignKey
ALTER TABLE "public"."Content" ADD CONSTRAINT "Content_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "public"."TrendSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Snapshot" ADD CONSTRAINT "Snapshot_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "public"."Content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Trend" ADD CONSTRAINT "Trend_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "public"."TrendSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

