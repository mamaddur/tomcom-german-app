-- CreateEnum
CREATE TYPE "LevelCode" AS ENUM ('A1', 'A2', 'B1');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('draft', 'in_review', 'approved', 'published');

-- CreateEnum
CREATE TYPE "ScreenType" AS ENUM ('explain', 'vocab', 'dialogue', 'practice');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('mcq', 'listen_choose', 'match_pairs', 'fill_gap', 'word_order');

-- CreateTable
CREATE TABLE "levels" (
    "id" UUID NOT NULL,
    "code" "LevelCode" NOT NULL,
    "title" JSONB NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "title" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "est_minutes" INTEGER NOT NULL,
    "trade_tags" TEXT[],
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "published_revision" INTEGER,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screens" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "ScreenType" NOT NULL,
    "body" JSONB NOT NULL,

    CONSTRAINT "screens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "answer" JSONB NOT NULL,
    "explanation" JSONB NOT NULL,
    "difficulty" INTEGER NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocab_items" (
    "id" UUID NOT NULL,
    "german" TEXT NOT NULL,
    "audio_id" UUID,
    "article" TEXT,
    "plural" TEXT,
    "meaning" JSONB NOT NULL,
    "image_id" UUID,
    "trade_tags" TEXT[],
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vocab_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_comments" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "review_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_revisions" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "levels_code_key" ON "levels"("code");

-- CreateIndex
CREATE INDEX "lessons_level_id_order_idx" ON "lessons"("level_id", "order");

-- CreateIndex
CREATE INDEX "screens_lesson_id_order_idx" ON "screens"("lesson_id", "order");

-- CreateIndex
CREATE INDEX "questions_lesson_id_idx" ON "questions"("lesson_id");

-- CreateIndex
CREATE INDEX "vocab_items_german_idx" ON "vocab_items"("german");

-- CreateIndex
CREATE INDEX "review_comments_lesson_id_created_at_idx" ON "review_comments"("lesson_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_revisions_lesson_id_revision_key" ON "lesson_revisions"("lesson_id", "revision");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screens" ADD CONSTRAINT "screens_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_revisions" ADD CONSTRAINT "lesson_revisions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The three CEFR levels in scope (BR-01). Titles need the Telugu reviewer.
INSERT INTO "levels" ("id", "code", "title", "order") VALUES
  ('01a17000-0000-7000-8000-0000000000a1', 'A1', '{"en": "A1 – Beginner", "te": "A1 – ప్రారంభ స్థాయి"}', 1),
  ('01a17000-0000-7000-8000-0000000000a2', 'A2', '{"en": "A2 – Elementary", "te": "A2 – ప్రాథమిక స్థాయి"}', 2),
  ('01a17000-0000-7000-8000-0000000000b1', 'B1', '{"en": "B1 – Intermediate", "te": "B1 – మధ్యస్థ స్థాయి"}', 3);
