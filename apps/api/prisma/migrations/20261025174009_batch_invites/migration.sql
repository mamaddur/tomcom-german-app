-- CreateTable
CREATE TABLE "batch_invites" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "phone_enc" BYTEA NOT NULL,
    "phone_hmac" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "batch_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "batch_invites_phone_hmac_idx" ON "batch_invites"("phone_hmac");

-- CreateIndex
CREATE UNIQUE INDEX "batch_invites_phone_hmac_batch_id_key" ON "batch_invites"("phone_hmac", "batch_id");

-- AddForeignKey
ALTER TABLE "batch_invites" ADD CONSTRAINT "batch_invites_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
