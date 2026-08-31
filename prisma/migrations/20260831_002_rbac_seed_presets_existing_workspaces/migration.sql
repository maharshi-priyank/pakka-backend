-- ============================================================
-- RBAC U2: Backfill preset roles for existing Studio workspaces
--
-- Seeds Designer, Account Manager, and Contractor preset roles
-- (isSystem = false, workspaceId = <workspace id>) for every Studio
-- workspace that does not already have them.
--
-- Studio plan lives on the User (not on Workspace), so this query
-- finds Studio workspaces by joining workspace_members → workspace_roles
-- (to find the OWNER member) → users (to check plan = 'STUDIO').
--
-- Idempotent: INSERT … WHERE NOT EXISTS, so safe to re-run.
-- ============================================================

DO $$
DECLARE
  ws RECORD;
  designer_id    TEXT;
  acctmgr_id     TEXT;
  contractor_id  TEXT;
BEGIN
  FOR ws IN
    SELECT DISTINCT wm."workspaceId" AS id
    FROM workspace_members wm
    INNER JOIN workspace_roles wr ON wr.id = wm."workspaceRoleId"
    INNER JOIN users u ON u.id = wm."userId"
    WHERE wr.key = 'OWNER' AND u.plan = 'STUDIO'
  LOOP

    -- ── Designer ────────────────────────────────────────────────────────────
    IF NOT EXISTS (
      SELECT 1 FROM workspace_roles
      WHERE "workspaceId" = ws.id AND key = 'PRESET_DESIGNER'
    ) THEN
      designer_id := gen_random_uuid()::TEXT;

      INSERT INTO workspace_roles (id, key, name, "isSystem", "sortOrder", "workspaceId")
      VALUES (designer_id, 'PRESET_DESIGNER', 'Designer', false, 10, ws.id);

      INSERT INTO workspace_role_permissions (id, "roleId", permission)
      VALUES
        (gen_random_uuid()::TEXT, designer_id, 'VIEW_CLIENTS'),
        (gen_random_uuid()::TEXT, designer_id, 'VIEW_PROJECTS'),
        (gen_random_uuid()::TEXT, designer_id, 'MANAGE_TASKS'),
        (gen_random_uuid()::TEXT, designer_id, 'VIEW_PROPOSALS'),
        (gen_random_uuid()::TEXT, designer_id, 'VIEW_INBOX'),
        (gen_random_uuid()::TEXT, designer_id, 'SEND_MESSAGES'),
        (gen_random_uuid()::TEXT, designer_id, 'VIEW_CALENDAR');
    END IF;

    -- ── Account Manager ──────────────────────────────────────────────────────
    IF NOT EXISTS (
      SELECT 1 FROM workspace_roles
      WHERE "workspaceId" = ws.id AND key = 'PRESET_ACCOUNT_MANAGER'
    ) THEN
      acctmgr_id := gen_random_uuid()::TEXT;

      INSERT INTO workspace_roles (id, key, name, "isSystem", "sortOrder", "workspaceId")
      VALUES (acctmgr_id, 'PRESET_ACCOUNT_MANAGER', 'Account Manager', false, 11, ws.id);

      INSERT INTO workspace_role_permissions (id, "roleId", permission)
      VALUES
        (gen_random_uuid()::TEXT, acctmgr_id, 'VIEW_LEADS'),
        (gen_random_uuid()::TEXT, acctmgr_id, 'MANAGE_LEADS'),
        (gen_random_uuid()::TEXT, acctmgr_id, 'VIEW_CLIENTS'),
        (gen_random_uuid()::TEXT, acctmgr_id, 'MANAGE_CLIENTS'),
        (gen_random_uuid()::TEXT, acctmgr_id, 'VIEW_PROJECTS'),
        (gen_random_uuid()::TEXT, acctmgr_id, 'VIEW_TASKS'),
        (gen_random_uuid()::TEXT, acctmgr_id, 'VIEW_PROPOSALS'),
        (gen_random_uuid()::TEXT, acctmgr_id, 'MANAGE_PROPOSALS'),
        (gen_random_uuid()::TEXT, acctmgr_id, 'SEND_PROPOSALS'),
        (gen_random_uuid()::TEXT, acctmgr_id, 'VIEW_CONTRACTS'),
        (gen_random_uuid()::TEXT, acctmgr_id, 'VIEW_INVOICES'),
        (gen_random_uuid()::TEXT, acctmgr_id, 'VIEW_REPORTS'),
        (gen_random_uuid()::TEXT, acctmgr_id, 'VIEW_INBOX'),
        (gen_random_uuid()::TEXT, acctmgr_id, 'SEND_MESSAGES'),
        (gen_random_uuid()::TEXT, acctmgr_id, 'VIEW_CALENDAR'),
        (gen_random_uuid()::TEXT, acctmgr_id, 'MANAGE_CALENDAR');
    END IF;

    -- ── Contractor ───────────────────────────────────────────────────────────
    IF NOT EXISTS (
      SELECT 1 FROM workspace_roles
      WHERE "workspaceId" = ws.id AND key = 'PRESET_CONTRACTOR'
    ) THEN
      contractor_id := gen_random_uuid()::TEXT;

      INSERT INTO workspace_roles (id, key, name, "isSystem", "sortOrder", "workspaceId")
      VALUES (contractor_id, 'PRESET_CONTRACTOR', 'Contractor', false, 12, ws.id);

      INSERT INTO workspace_role_permissions (id, "roleId", permission)
      VALUES
        (gen_random_uuid()::TEXT, contractor_id, 'VIEW_PROJECTS'),
        (gen_random_uuid()::TEXT, contractor_id, 'VIEW_TASKS'),
        (gen_random_uuid()::TEXT, contractor_id, 'MANAGE_TASKS'),
        (gen_random_uuid()::TEXT, contractor_id, 'VIEW_INBOX'),
        (gen_random_uuid()::TEXT, contractor_id, 'SEND_MESSAGES'),
        (gen_random_uuid()::TEXT, contractor_id, 'VIEW_CALENDAR');
    END IF;

  END LOOP;
END;
$$;
