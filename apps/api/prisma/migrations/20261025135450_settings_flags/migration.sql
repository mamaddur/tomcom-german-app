-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);
