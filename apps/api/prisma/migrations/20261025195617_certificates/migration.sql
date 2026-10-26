-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "learner_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "holder_name" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,
    "revoked_by" UUID,
    "revoke_reason" TEXT,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_code_key" ON "certificates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_attempt_id_key" ON "certificates"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_learner_id_level_id_key" ON "certificates"("learner_id", "level_id");

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
