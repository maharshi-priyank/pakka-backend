-- ============================================================
-- RBAC: workspace roles + permissions
-- Defensive migration — safe to re-run on partial state
-- ============================================================

-- Step 1: Rename WorkspaceRole enum → LegacyMemberRole (if not already done)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WorkspaceRole') THEN
    ALTER TYPE "WorkspaceRole" RENAME TO "LegacyMemberRole";
  END IF;
END $$;

-- Step 2: Drop partially-created tables (order matters: child before parent)
DROP TABLE IF EXISTS "workspace_role_permissions" CASCADE;
DROP TABLE IF EXISTS "workspace_roles" CASCADE;

-- Step 3: Drop Permission enum if it was partially created
DROP TYPE IF EXISTS "Permission";

-- Step 4: Re-create Permission enum
CREATE TYPE "Permission" AS ENUM (
  'VIEW_LEADS', 'MANAGE_LEADS',
  'VIEW_CLIENTS', 'MANAGE_CLIENTS',
  'VIEW_PROJECTS', 'MANAGE_PROJECTS',
  'VIEW_TASKS', 'MANAGE_TASKS',
  'VIEW_INBOX', 'SEND_MESSAGES',
  'VIEW_PROPOSALS', 'MANAGE_PROPOSALS', 'SEND_PROPOSALS',
  'VIEW_CONTRACTS', 'MANAGE_CONTRACTS', 'SEND_CONTRACTS',
  'VIEW_INVOICES', 'MANAGE_INVOICES', 'SEND_INVOICES', 'RECORD_PAYMENTS',
  'VIEW_REPORTS',
  'VIEW_CALENDAR', 'MANAGE_CALENDAR',
  'VIEW_FORMS', 'MANAGE_FORMS',
  'VIEW_AUTOMATIONS', 'MANAGE_AUTOMATIONS',
  'MANAGE_WORKSPACE_SETTINGS', 'MANAGE_BILLING', 'MANAGE_MEMBERS', 'MANAGE_INTEGRATIONS'
);

-- Step 5: Create workspace_roles (camelCase columns)
CREATE TABLE "workspace_roles" (
  "id"          TEXT NOT NULL,
  "key"         TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "isSystem"    BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_roles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_roles_key_key" UNIQUE ("key")
);

-- Step 6: Create workspace_role_permissions (camelCase columns)
CREATE TABLE "workspace_role_permissions" (
  "id"         TEXT NOT NULL,
  "roleId"     TEXT NOT NULL,
  "permission" "Permission" NOT NULL,
  CONSTRAINT "workspace_role_permissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_role_permissions_roleId_permission_key" UNIQUE ("roleId", "permission"),
  CONSTRAINT "workspace_role_permissions_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "workspace_roles"("id") ON DELETE CASCADE
);

CREATE INDEX "workspace_role_permissions_roleId_idx" ON "workspace_role_permissions"("roleId");

-- Step 7: Add workspaceRoleId columns (drop old snake_case version first if exists)
ALTER TABLE "workspace_members" DROP COLUMN IF EXISTS "workspace_role_id";
ALTER TABLE "workspace_members" DROP COLUMN IF EXISTS "workspaceRoleId";
ALTER TABLE "workspace_members" ADD COLUMN "workspaceRoleId" TEXT;

ALTER TABLE "team_invites" DROP COLUMN IF EXISTS "workspace_role_id";
ALTER TABLE "team_invites" DROP COLUMN IF EXISTS "workspaceRoleId";
ALTER TABLE "team_invites" ADD COLUMN "workspaceRoleId" TEXT;

-- Step 8: Seed 4 preset roles
INSERT INTO "workspace_roles" ("id", "key", "name", "description", "isSystem", "sortOrder") VALUES
  (gen_random_uuid()::text, 'OWNER',  'Owner',  'Full access to all workspace features',    true, 0),
  (gen_random_uuid()::text, 'ADMIN',  'Admin',  'Full access except billing management',    true, 1),
  (gen_random_uuid()::text, 'MEMBER', 'Member', 'Operational access, no financial data',    true, 2),
  (gen_random_uuid()::text, 'VIEWER', 'Viewer', 'Read-only access to operational sections', true, 3);

-- Step 9: Seed OWNER permissions (all 31)
INSERT INTO "workspace_role_permissions" ("id", "roleId", "permission")
SELECT gen_random_uuid()::text, r.id, p.permission::"Permission"
FROM "workspace_roles" r
CROSS JOIN (VALUES
  ('VIEW_LEADS'), ('MANAGE_LEADS'), ('VIEW_CLIENTS'), ('MANAGE_CLIENTS'),
  ('VIEW_PROJECTS'), ('MANAGE_PROJECTS'), ('VIEW_TASKS'), ('MANAGE_TASKS'),
  ('VIEW_INBOX'), ('SEND_MESSAGES'), ('VIEW_PROPOSALS'), ('MANAGE_PROPOSALS'),
  ('SEND_PROPOSALS'), ('VIEW_CONTRACTS'), ('MANAGE_CONTRACTS'), ('SEND_CONTRACTS'),
  ('VIEW_INVOICES'), ('MANAGE_INVOICES'), ('SEND_INVOICES'), ('RECORD_PAYMENTS'),
  ('VIEW_REPORTS'), ('VIEW_CALENDAR'), ('MANAGE_CALENDAR'), ('VIEW_FORMS'),
  ('MANAGE_FORMS'), ('VIEW_AUTOMATIONS'), ('MANAGE_AUTOMATIONS'),
  ('MANAGE_WORKSPACE_SETTINGS'), ('MANAGE_BILLING'), ('MANAGE_MEMBERS'), ('MANAGE_INTEGRATIONS')
) AS p(permission)
WHERE r.key = 'OWNER';

-- Step 10: Seed ADMIN permissions (all except MANAGE_BILLING)
INSERT INTO "workspace_role_permissions" ("id", "roleId", "permission")
SELECT gen_random_uuid()::text, r.id, p.permission::"Permission"
FROM "workspace_roles" r
CROSS JOIN (VALUES
  ('VIEW_LEADS'), ('MANAGE_LEADS'), ('VIEW_CLIENTS'), ('MANAGE_CLIENTS'),
  ('VIEW_PROJECTS'), ('MANAGE_PROJECTS'), ('VIEW_TASKS'), ('MANAGE_TASKS'),
  ('VIEW_INBOX'), ('SEND_MESSAGES'), ('VIEW_PROPOSALS'), ('MANAGE_PROPOSALS'),
  ('SEND_PROPOSALS'), ('VIEW_CONTRACTS'), ('MANAGE_CONTRACTS'), ('SEND_CONTRACTS'),
  ('VIEW_INVOICES'), ('MANAGE_INVOICES'), ('SEND_INVOICES'), ('RECORD_PAYMENTS'),
  ('VIEW_REPORTS'), ('VIEW_CALENDAR'), ('MANAGE_CALENDAR'), ('VIEW_FORMS'),
  ('MANAGE_FORMS'), ('VIEW_AUTOMATIONS'), ('MANAGE_AUTOMATIONS'),
  ('MANAGE_WORKSPACE_SETTINGS'), ('MANAGE_MEMBERS'), ('MANAGE_INTEGRATIONS')
) AS p(permission)
WHERE r.key = 'ADMIN';

-- Step 11: Seed MEMBER permissions (operational, no financial)
INSERT INTO "workspace_role_permissions" ("id", "roleId", "permission")
SELECT gen_random_uuid()::text, r.id, p.permission::"Permission"
FROM "workspace_roles" r
CROSS JOIN (VALUES
  ('VIEW_LEADS'), ('MANAGE_LEADS'), ('VIEW_CLIENTS'), ('MANAGE_CLIENTS'),
  ('VIEW_PROJECTS'), ('MANAGE_PROJECTS'), ('VIEW_TASKS'), ('MANAGE_TASKS'),
  ('VIEW_INBOX'), ('SEND_MESSAGES'), ('VIEW_PROPOSALS'), ('MANAGE_PROPOSALS'),
  ('VIEW_CONTRACTS'), ('MANAGE_CONTRACTS'),
  ('VIEW_CALENDAR'), ('MANAGE_CALENDAR'),
  ('VIEW_FORMS'), ('VIEW_AUTOMATIONS')
) AS p(permission)
WHERE r.key = 'MEMBER';

-- Step 12: Seed VIEWER permissions (read-only)
INSERT INTO "workspace_role_permissions" ("id", "roleId", "permission")
SELECT gen_random_uuid()::text, r.id, p.permission::"Permission"
FROM "workspace_roles" r
CROSS JOIN (VALUES
  ('VIEW_LEADS'), ('VIEW_CLIENTS'), ('VIEW_PROJECTS'), ('VIEW_TASKS'),
  ('VIEW_INBOX'), ('VIEW_PROPOSALS'), ('VIEW_CONTRACTS'),
  ('VIEW_CALENDAR'), ('VIEW_FORMS'), ('VIEW_AUTOMATIONS')
) AS p(permission)
WHERE r.key = 'VIEWER';

-- Step 13: Populate workspaceRoleId on existing workspace_members
UPDATE "workspace_members" wm
SET "workspaceRoleId" = wr.id
FROM "workspace_roles" wr
WHERE (wm.role::text = 'OWNER'  AND wr.key = 'OWNER')
   OR (wm.role::text = 'MEMBER' AND wr.key = 'MEMBER');

-- Step 14: Make workspaceRoleId NOT NULL and add FK
ALTER TABLE "workspace_members"
  ALTER COLUMN "workspaceRoleId" SET NOT NULL;

ALTER TABLE "workspace_members"
  ADD CONSTRAINT "workspace_members_workspaceRoleId_fkey"
  FOREIGN KEY ("workspaceRoleId") REFERENCES "workspace_roles"("id");
