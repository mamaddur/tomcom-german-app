-- CreateEnum
CREATE TYPE "CheckpointAttemptStatus" AS ENUM ('in_progress', 'awaiting_marking', 'passed', 'failed', 'expired');

-- CreateTable
CREATE TABLE "checkpoint_attempts" (
    "id" UUID NOT NULL,
    "learner_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "checkpoint_revision" INTEGER NOT NULL,
    "pass_mark" DOUBLE PRECISION NOT NULL,
    "items" JSONB NOT NULL,
    "responses" JSONB,
    "section_scores" JSONB,
    "writing_marks" JSONB,
    "total" DOUBLE PRECISION,
    "status" "CheckpointAttemptStatus" NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "submitted_at" TIMESTAMPTZ,
    "marked_by" UUID,
    "marked_at" TIMESTAMPTZ,

    CONSTRAINT "checkpoint_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checkpoint_attempts_learner_id_level_id_idx" ON "checkpoint_attempts"("learner_id", "level_id");

-- CreateIndex
CREATE INDEX "checkpoint_attempts_status_idx" ON "checkpoint_attempts"("status");

-- AddForeignKey
ALTER TABLE "checkpoint_attempts" ADD CONSTRAINT "checkpoint_attempts_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_attempts" ADD CONSTRAINT "checkpoint_attempts_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
