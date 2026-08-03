CREATE TABLE IF NOT EXISTS "admin_workspace_feature_flags" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "flag" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_workspace_feature_flags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_workspace_feature_flags_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_workspace_feature_flags_workspace_id_flag_key"
  ON "admin_workspace_feature_flags"("workspace_id", "flag");
CREATE INDEX IF NOT EXISTS "admin_workspace_feature_flags_workspace_id_idx"
  ON "admin_workspace_feature_flags"("workspace_id");
