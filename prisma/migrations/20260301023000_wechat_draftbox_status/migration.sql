DO $$
BEGIN
  ALTER TYPE "DraftStatus" ADD VALUE 'SUBMITTED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PublishDeliveryStage" AS ENUM ('DRAFTBOX', 'PUBLISHED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "PublishJob"
ADD COLUMN IF NOT EXISTS "deliveryStage" "PublishDeliveryStage" NOT NULL DEFAULT 'DRAFTBOX';
