-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "learner_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "pack_version" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "finished_at" TIMESTAMPTZ NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "learner_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "best_score" DOUBLE PRECISION NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "passed_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("learner_id","lesson_id")
);

-- CreateTable
CREATE TABLE "daily_activity" (
    "learner_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "seconds" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "daily_activity_pkey" PRIMARY KEY ("learner_id","date")
);

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_client_id_key" ON "quiz_attempts"("client_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_learner_id_lesson_id_idx" ON "quiz_attempts"("learner_id", "lesson_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_lesson_id_idx" ON "quiz_attempts"("lesson_id");

-- CreateIndex
CREATE INDEX "lesson_progress_lesson_id_idx" ON "lesson_progress"("lesson_id");

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
