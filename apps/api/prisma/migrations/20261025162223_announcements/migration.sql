-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "body" JSONB NOT NULL,
    "batch_id" UUID,
    "starts_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_starts_at_idx" ON "announcements"("starts_at");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
