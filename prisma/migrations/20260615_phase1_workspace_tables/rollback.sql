-- Phase 1 rollback: remove workspace tables and activeWorkspaceId
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_activeWorkspaceId_fkey";
ALTER TABLE "users" DROP COLUMN IF EXISTS "activeWorkspaceId";
DROP TABLE IF EXISTS "workspace_members";
DROP TABLE IF EXISTS "workspaces";
