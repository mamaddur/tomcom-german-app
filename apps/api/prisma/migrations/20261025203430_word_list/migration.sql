-- CreateTable
CREATE TABLE "word_list" (
    "learner_id" UUID NOT NULL,
    "vocab_id" UUID NOT NULL,
    "box" INTEGER NOT NULL,
    "due" DATE NOT NULL,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "word_list_pkey" PRIMARY KEY ("learner_id","vocab_id")
);

-- AddForeignKey
ALTER TABLE "word_list" ADD CONSTRAINT "word_list_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_list" ADD CONSTRAINT "word_list_vocab_id_fkey" FOREIGN KEY ("vocab_id") REFERENCES "vocab_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
