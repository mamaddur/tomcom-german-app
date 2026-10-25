-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('audio', 'image', 'video');

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "type" "MediaType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "duration_ms" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");
