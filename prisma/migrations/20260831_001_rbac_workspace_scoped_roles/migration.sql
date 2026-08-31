-- ============================================================
-- RBAC U1: workspace-scoped roles
--
-- Adds workspaceId to workspace_roles so custom/preset roles can be
-- scoped to a single workspace while system roles (OWNER/ADMIN/MEMBER/
-- VIEWER) stay global (workspace_id IS NULL).
--
-- Postgres treats NULL as distinct in a standard UNIQUE constraint, so a
-- plain UNIQUE(workspace_id, key) would allow duplicate (NULL, 'OWNER')
-- rows. Two partial unique indexes are used instead — this statement
-- cannot be expressed in Prisma schema syntax, hence the raw SQL here.
--
-- NOTE: intentionally not CONCURRENTLY — CREATE INDEX CONCURRENTLY cannot
-- run inside the transaction Prisma wraps migrations in. workspace_roles
-- is a small table; a brief lock is acceptable.
-- ============================================================

-- Step 1: add the nullable workspaceId column + FK
ALTER TABLE "workspace_roles" ADD COLUMN "workspaceId" TEXT;

ALTER TABLE "workspace_roles"
  ADD CONSTRAINT "workspace_roles_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;

CREATE INDEX "workspace_roles_workspaceId_idx" ON "workspace_roles"("workspaceId");

-- Step 2: drop the old global-unique constraint on key
ALTER TABLE "workspace_roles" DROP CONSTRAINT IF EXISTS "workspace_roles_key_key";

-- Step 3: partial unique indexes replacing it
CREATE UNIQUE INDEX "workspace_roles_key_system_unique"
  ON "workspace_roles" ("key") WHERE "workspaceId" IS NULL;

CREATE UNIQUE INDEX "workspace_roles_workspace_key_unique"
  ON "workspace_roles" ("workspaceId", "key") WHERE "workspaceId" IS NOT NULL;
