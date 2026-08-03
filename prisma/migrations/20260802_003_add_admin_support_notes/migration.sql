CREATE TABLE IF NOT EXISTS "admin_support_notes" (
    "id"         TEXT NOT NULL,
    "admin_id"   TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id"  TEXT NOT NULL,
    "body"       TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_support_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "admin_support_notes_target_type_target_id_idx"
  ON "admin_support_notes"("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "admin_support_notes_admin_id_idx"
  ON "admin_support_notes"("admin_id");
CREATE INDEX IF NOT EXISTS "admin_support_notes_created_at_idx"
  ON "admin_support_notes"("created_at");
