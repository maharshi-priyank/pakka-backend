-- Phase 2 idempotent fix + continuation script
-- Handles any partial state from the first migration attempt
-- Uses DO blocks to check column existence before renaming

-- Helper: rename userId→workspaceId for a table (idempotent)
-- After rename, normalize team-member values → owner workspace id
-- Then add FK constraint

-- leads
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_userId_fkey";
    ALTER TABLE "leads" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "leads" l SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = l."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_workspaceId_fkey";
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- clients
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "clients_userId_fkey";
    ALTER TABLE "clients" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "clients" c SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = c."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "clients_workspaceId_fkey";
ALTER TABLE "clients" ADD CONSTRAINT "clients_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- proposals
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='proposals' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "proposals" DROP CONSTRAINT IF EXISTS "proposals_userId_fkey";
    ALTER TABLE "proposals" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "proposals" p SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = p."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "proposals" DROP CONSTRAINT IF EXISTS "proposals_workspaceId_fkey";
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- contracts
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contracts' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_userId_fkey";
    ALTER TABLE "contracts" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "contracts" c SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = c."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_workspaceId_fkey";
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- invoices
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_userId_fkey";
    ALTER TABLE "invoices" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "invoices" i SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = i."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_workspaceId_fkey";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- projects
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_userId_fkey";
    ALTER TABLE "projects" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "projects" p SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = p."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_workspaceId_fkey";
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- tasks
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_userId_fkey";
    ALTER TABLE "tasks" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "tasks" t SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = t."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_workspaceId_fkey";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- task_boards
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_boards' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "task_boards" DROP CONSTRAINT IF EXISTS "task_boards_userId_fkey";
    ALTER TABLE "task_boards" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "task_boards" tb SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = tb."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "task_boards" DROP CONSTRAINT IF EXISTS "task_boards_workspaceId_fkey";
ALTER TABLE "task_boards" ADD CONSTRAINT "task_boards_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- meetings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='meetings' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "meetings" DROP CONSTRAINT IF EXISTS "meetings_userId_fkey";
    ALTER TABLE "meetings" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "meetings" m SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = m."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "meetings" DROP CONSTRAINT IF EXISTS "meetings_workspaceId_fkey";
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- time_entries
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='time_entries' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "time_entries" DROP CONSTRAINT IF EXISTS "time_entries_userId_fkey";
    ALTER TABLE "time_entries" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "time_entries" te SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = te."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "time_entries" DROP CONSTRAINT IF EXISTS "time_entries_workspaceId_fkey";
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- expenses
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_userId_fkey";
    ALTER TABLE "expenses" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "expenses" e SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = e."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_workspaceId_fkey";
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- threads
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='threads' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "threads" DROP CONSTRAINT IF EXISTS "threads_userId_fkey";
    ALTER TABLE "threads" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "threads" t SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = t."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "threads" DROP CONSTRAINT IF EXISTS "threads_workspaceId_fkey";
ALTER TABLE "threads" ADD CONSTRAINT "threads_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- notifications
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_userId_fkey";
    ALTER TABLE "notifications" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "notifications" n SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = n."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_workspaceId_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- push_subscriptions
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='push_subscriptions' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "push_subscriptions_userId_fkey";
    ALTER TABLE "push_subscriptions" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "push_subscriptions" ps SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = ps."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "push_subscriptions_workspaceId_fkey";
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- intake_forms
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='intake_forms' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "intake_forms" DROP CONSTRAINT IF EXISTS "intake_forms_userId_fkey";
    ALTER TABLE "intake_forms" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "intake_forms" inf SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = inf."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "intake_forms" DROP CONSTRAINT IF EXISTS "intake_forms_workspaceId_fkey";
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- automation_rules: has @@unique([userId, key]) — system rules seeded per user on signup,
-- so team members have duplicate keys vs their owner. Delete those duplicates first.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='automation_rules' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "automation_rules" DROP CONSTRAINT IF EXISTS "automation_rules_userId_fkey";
    ALTER TABLE "automation_rules" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
-- Delete team-member rows whose key already exists on the owner's workspace
DELETE FROM "automation_rules" ar
  USING "users" u
  WHERE u."id" = ar."workspaceId"
    AND u."ownerId" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "automation_rules" ar2
      WHERE ar2."workspaceId" = u."ownerId" AND ar2."key" = ar."key"
    );
-- Normalize any remaining team-member rows (custom rules not duplicated on owner)
UPDATE "automation_rules" ar SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = ar."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "automation_rules" DROP CONSTRAINT IF EXISTS "automation_rules_workspaceId_fkey";
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- automation_workflows
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='automation_workflows' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "automation_workflows" DROP CONSTRAINT IF EXISTS "automation_workflows_userId_fkey";
    ALTER TABLE "automation_workflows" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "automation_workflows" aw SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = aw."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "automation_workflows" DROP CONSTRAINT IF EXISTS "automation_workflows_workspaceId_fkey";
ALTER TABLE "automation_workflows" ADD CONSTRAINT "automation_workflows_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- workflow_runs
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workflow_runs' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "workflow_runs" DROP CONSTRAINT IF EXISTS "workflow_runs_userId_fkey";
    ALTER TABLE "workflow_runs" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "workflow_runs" wr SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = wr."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "workflow_runs" DROP CONSTRAINT IF EXISTS "workflow_runs_workspaceId_fkey";
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- email_templates
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_templates' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "email_templates" DROP CONSTRAINT IF EXISTS "email_templates_userId_fkey";
    ALTER TABLE "email_templates" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "email_templates" et SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = et."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "email_templates" DROP CONSTRAINT IF EXISTS "email_templates_workspaceId_fkey";
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- attachments
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attachments' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "attachments" DROP CONSTRAINT IF EXISTS "attachments_userId_fkey";
    ALTER TABLE "attachments" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "attachments" a SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = a."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "attachments" DROP CONSTRAINT IF EXISTS "attachments_workspaceId_fkey";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- client_notes
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='client_notes' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "client_notes" DROP CONSTRAINT IF EXISTS "client_notes_userId_fkey";
    ALTER TABLE "client_notes" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "client_notes" cn SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = cn."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "client_notes" DROP CONSTRAINT IF EXISTS "client_notes_workspaceId_fkey";
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- project_notes
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_notes' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "project_notes" DROP CONSTRAINT IF EXISTS "project_notes_userId_fkey";
    ALTER TABLE "project_notes" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "project_notes" pn SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = pn."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "project_notes" DROP CONSTRAINT IF EXISTS "project_notes_workspaceId_fkey";
ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- proposal_templates
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='proposal_templates' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "proposal_templates" DROP CONSTRAINT IF EXISTS "proposal_templates_userId_fkey";
    ALTER TABLE "proposal_templates" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "proposal_templates" pt SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = pt."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "proposal_templates" DROP CONSTRAINT IF EXISTS "proposal_templates_workspaceId_fkey";
ALTER TABLE "proposal_templates" ADD CONSTRAINT "proposal_templates_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- email_logs
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_logs' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "email_logs" DROP CONSTRAINT IF EXISTS "email_logs_userId_fkey";
    ALTER TABLE "email_logs" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "email_logs" el SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = el."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "email_logs" DROP CONSTRAINT IF EXISTS "email_logs_workspaceId_fkey";
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- billing_events (nullable workspaceId)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_events' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "billing_events" DROP CONSTRAINT IF EXISTS "billing_events_userId_fkey";
    ALTER TABLE "billing_events" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "billing_events" be SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = be."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "billing_events" DROP CONSTRAINT IF EXISTS "billing_events_workspaceId_fkey";
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- promo_redemptions
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promo_redemptions' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "promo_redemptions" DROP CONSTRAINT IF EXISTS "promo_redemptions_userId_fkey";
    ALTER TABLE "promo_redemptions" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "promo_redemptions" pr SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = pr."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "promo_redemptions" DROP CONSTRAINT IF EXISTS "promo_redemptions_workspaceId_fkey";
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- public_profile_enquiries
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='public_profile_enquiries' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "public_profile_enquiries" DROP CONSTRAINT IF EXISTS "public_profile_enquiries_userId_fkey";
    ALTER TABLE "public_profile_enquiries" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "public_profile_enquiries" ppe SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = ppe."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "public_profile_enquiries" DROP CONSTRAINT IF EXISTS "public_profile_enquiries_workspaceId_fkey";
ALTER TABLE "public_profile_enquiries" ADD CONSTRAINT "public_profile_enquiries_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- user_expense_categories
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_expense_categories' AND column_name='userId' AND table_schema='public') THEN
    ALTER TABLE "user_expense_categories" DROP CONSTRAINT IF EXISTS "user_expense_categories_userId_fkey";
    ALTER TABLE "user_expense_categories" RENAME COLUMN "userId" TO "workspaceId";
  END IF;
END $$;
UPDATE "user_expense_categories" uec SET "workspaceId" = u."ownerId" FROM "users" u
  WHERE u."id" = uec."workspaceId" AND u."ownerId" IS NOT NULL;
ALTER TABLE "user_expense_categories" DROP CONSTRAINT IF EXISTS "user_expense_categories_workspaceId_fkey";
ALTER TABLE "user_expense_categories" ADD CONSTRAINT "user_expense_categories_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
