-- CreateEnum
CREATE TYPE "TutorRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "TutorFlagStatus" AS ENUM ('open', 'resolved');

-- CreateTable
CREATE TABLE "tutor_messages" (
    "id" UUID NOT NULL,
    "learner_id" UUID NOT NULL,
    "role" "TutorRole" NOT NULL,
    "content" TEXT NOT NULL,
    "level" "GermanLevel" NOT NULL,
    "lesson_id" UUID,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "filtered" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_flags" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "learner_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "TutorFlagStatus" NOT NULL DEFAULT 'open',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tutor_messages_learner_id_created_at_idx" ON "tutor_messages"("learner_id", "created_at");

-- CreateIndex
CREATE INDEX "tutor_messages_created_at_idx" ON "tutor_messages"("created_at");

-- CreateIndex
CREATE INDEX "tutor_flags_status_created_at_idx" ON "tutor_flags"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_flags_message_id_learner_id_key" ON "tutor_flags"("message_id", "learner_id");

-- AddForeignKey
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_flags" ADD CONSTRAINT "tutor_flags_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "tutor_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_flags" ADD CONSTRAINT "tutor_flags_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
