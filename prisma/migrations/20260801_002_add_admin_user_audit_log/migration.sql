-- Admin Panel: admin identity, audit log, workspace soft-delete
-- Adds AdminRole enum, admin_users + audit_logs tables, archivedAt on workspaces

-- 1. AdminRole enum (SUPERADMIN, SUPPORT)
CREATE TYPE "AdminRole" AS ENUM ('SUPERADMIN', 'SUPPORT');

-- 2. admin_users table (separate admin identity — no relation to tenant users)
CREATE TABLE "admin_users" (
    "id"            TEXT NOT NULL,
    "email"         TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name"          TEXT,
    "role"          "AdminRole" NOT NULL DEFAULT 'SUPPORT',
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- 3. audit_logs table (append-only, top-level — no workspace FK)
CREATE TABLE "audit_logs" (
    "id"          TEXT NOT NULL,
    "admin_id"    TEXT NOT NULL,
    "admin_role"  "AdminRole" NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id"   TEXT,
    "action"      TEXT NOT NULL,
    "before"      JSONB,
    "after"       JSONB,
    "reason"      TEXT,
    "at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_admin_id_idx"        ON "audit_logs"("admin_id");
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");
CREATE INDEX "audit_logs_action_idx"          ON "audit_logs"("action");
CREATE INDEX "audit_logs_at_idx"              ON "audit_logs"("at");

-- 4. Workspace soft-delete column (recoverable, mirrors archivedAt on child models)
ALTER TABLE "workspaces" ADD COLUMN "archived_at" TIMESTAMP(3);
