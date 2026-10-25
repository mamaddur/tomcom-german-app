-- CreateEnum
CREATE TYPE "GermanLevel" AS ENUM ('none', 'A1', 'A2', 'B1');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('active', 'closed');

-- CreateEnum
CREATE TYPE "EnrolmentSource" AS ENUM ('code', 'admin', 'bulk');

-- CreateTable
CREATE TABLE "districts" (
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "trades" (
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "learner_profiles" (
    "user_id" UUID NOT NULL,
    "district_code" TEXT NOT NULL,
    "trade_code" TEXT NOT NULL,
    "target_job" TEXT,
    "self_declared_level" "GermanLevel" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "learner_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district_code" TEXT,
    "trade_code" TEXT,
    "start_date" DATE,
    "status" "BatchStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_trainers" (
    "batch_id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,

    CONSTRAINT "batch_trainers_pkey" PRIMARY KEY ("batch_id","trainer_id")
);

-- CreateTable
CREATE TABLE "enrolments" (
    "id" UUID NOT NULL,
    "learner_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "source" "EnrolmentSource" NOT NULL,
    "enrolled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ,

    CONSTRAINT "enrolments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "batches_code_key" ON "batches"("code");

-- CreateIndex
CREATE INDEX "enrolments_batch_id_idx" ON "enrolments"("batch_id");

-- AddForeignKey
ALTER TABLE "learner_profiles" ADD CONSTRAINT "learner_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_profiles" ADD CONSTRAINT "learner_profiles_district_code_fkey" FOREIGN KEY ("district_code") REFERENCES "districts"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_profiles" ADD CONSTRAINT "learner_profiles_trade_code_fkey" FOREIGN KEY ("trade_code") REFERENCES "trades"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_district_code_fkey" FOREIGN KEY ("district_code") REFERENCES "districts"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_trade_code_fkey" FOREIGN KEY ("trade_code") REFERENCES "trades"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_trainers" ADD CONSTRAINT "batch_trainers_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_trainers" ADD CONSTRAINT "batch_trainers_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A learner is in at most one batch at a time.
CREATE UNIQUE INDEX "enrolments_one_active_per_learner" ON "enrolments" ("learner_id") WHERE "left_at" IS NULL;
