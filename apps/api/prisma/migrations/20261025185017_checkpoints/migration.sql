-- CreateTable
CREATE TABLE "checkpoints" (
    "id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "published_content" JSONB,
    "published_revision" INTEGER,
    "published_by" UUID,
    "published_at" TIMESTAMPTZ,

    CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkpoints_level_id_key" ON "checkpoints"("level_id");

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
