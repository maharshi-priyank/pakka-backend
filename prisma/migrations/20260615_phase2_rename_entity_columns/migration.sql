-- Phase 2: Rename "userId" → "workspaceId" on all 28 entity tables
-- Drop old FKs (→ users), rename column, add new FKs (→ workspaces)
-- All values are unchanged — workspace.id = user.id for all existing data

-- leads
ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_userId_fkey";
ALTER TABLE "leads" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- clients
ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "clients_userId_fkey";
ALTER TABLE "clients" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "clients" ADD CONSTRAINT "clients_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- proposals
ALTER TABLE "proposals" DROP CONSTRAINT IF EXISTS "proposals_userId_fkey";
ALTER TABLE "proposals" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- contracts
ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_userId_fkey";
ALTER TABLE "contracts" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- invoices
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_userId_fkey";
ALTER TABLE "invoices" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- projects
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_userId_fkey";
ALTER TABLE "projects" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- tasks
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_userId_fkey";
ALTER TABLE "tasks" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- task_boards
ALTER TABLE "task_boards" DROP CONSTRAINT IF EXISTS "task_boards_userId_fkey";
ALTER TABLE "task_boards" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "task_boards" ADD CONSTRAINT "task_boards_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- meetings
ALTER TABLE "meetings" DROP CONSTRAINT IF EXISTS "meetings_userId_fkey";
ALTER TABLE "meetings" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- time_entries
ALTER TABLE "time_entries" DROP CONSTRAINT IF EXISTS "time_entries_userId_fkey";
ALTER TABLE "time_entries" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- expenses
ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_userId_fkey";
ALTER TABLE "expenses" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- threads
ALTER TABLE "threads" DROP CONSTRAINT IF EXISTS "threads_userId_fkey";
ALTER TABLE "threads" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "threads" ADD CONSTRAINT "threads_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- notifications
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_userId_fkey";
ALTER TABLE "notifications" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- push_subscriptions
ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "push_subscriptions_userId_fkey";
ALTER TABLE "push_subscriptions" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- intake_forms
ALTER TABLE "intake_forms" DROP CONSTRAINT IF EXISTS "intake_forms_userId_fkey";
ALTER TABLE "intake_forms" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- automation_rules
ALTER TABLE "automation_rules" DROP CONSTRAINT IF EXISTS "automation_rules_userId_fkey";
ALTER TABLE "automation_rules" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- automation_workflows
ALTER TABLE "automation_workflows" DROP CONSTRAINT IF EXISTS "automation_workflows_userId_fkey";
ALTER TABLE "automation_workflows" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "automation_workflows" ADD CONSTRAINT "automation_workflows_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- workflow_runs
ALTER TABLE "workflow_runs" DROP CONSTRAINT IF EXISTS "workflow_runs_userId_fkey";
ALTER TABLE "workflow_runs" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- email_templates
ALTER TABLE "email_templates" DROP CONSTRAINT IF EXISTS "email_templates_userId_fkey";
ALTER TABLE "email_templates" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- attachments
ALTER TABLE "attachments" DROP CONSTRAINT IF EXISTS "attachments_userId_fkey";
ALTER TABLE "attachments" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- client_notes
ALTER TABLE "client_notes" DROP CONSTRAINT IF EXISTS "client_notes_userId_fkey";
ALTER TABLE "client_notes" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- project_notes
ALTER TABLE "project_notes" DROP CONSTRAINT IF EXISTS "project_notes_userId_fkey";
ALTER TABLE "project_notes" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- proposal_templates
ALTER TABLE "proposal_templates" DROP CONSTRAINT IF EXISTS "proposal_templates_userId_fkey";
ALTER TABLE "proposal_templates" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "proposal_templates" ADD CONSTRAINT "proposal_templates_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- email_logs
ALTER TABLE "email_logs" DROP CONSTRAINT IF EXISTS "email_logs_userId_fkey";
ALTER TABLE "email_logs" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- billing_events (nullable userId → nullable workspaceId)
ALTER TABLE "billing_events" DROP CONSTRAINT IF EXISTS "billing_events_userId_fkey";
ALTER TABLE "billing_events" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- promo_redemptions
ALTER TABLE "promo_redemptions" DROP CONSTRAINT IF EXISTS "promo_redemptions_userId_fkey";
ALTER TABLE "promo_redemptions" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- public_profile_enquiries
ALTER TABLE "public_profile_enquiries" DROP CONSTRAINT IF EXISTS "public_profile_enquiries_userId_fkey";
ALTER TABLE "public_profile_enquiries" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "public_profile_enquiries" ADD CONSTRAINT "public_profile_enquiries_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- user_expense_categories
ALTER TABLE "user_expense_categories" DROP CONSTRAINT IF EXISTS "user_expense_categories_userId_fkey";
ALTER TABLE "user_expense_categories" RENAME COLUMN "userId" TO "workspaceId";
ALTER TABLE "user_expense_categories" ADD CONSTRAINT "user_expense_categories_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
