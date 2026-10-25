-- CreateTable
CREATE TABLE "pack_versions" (
    "id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "zip_key" TEXT NOT NULL,
    "manifest_key" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "lesson_count" INTEGER NOT NULL,
    "published_by" UUID NOT NULL,
    "published_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pack_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pack_versions_level_id_version_key" ON "pack_versions"("level_id", "version");

-- AddForeignKey
ALTER TABLE "pack_versions" ADD CONSTRAINT "pack_versions_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
