-- Phase 2 rollback: rename "workspaceId" back to "userId" and restore FKs to users

ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_workspaceId_fkey";
ALTER TABLE "leads" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "leads" ADD CONSTRAINT "leads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "clients_workspaceId_fkey";
ALTER TABLE "clients" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "clients" ADD CONSTRAINT "clients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proposals" DROP CONSTRAINT IF EXISTS "proposals_workspaceId_fkey";
ALTER TABLE "proposals" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_workspaceId_fkey";
ALTER TABLE "contracts" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_workspaceId_fkey";
ALTER TABLE "invoices" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_workspaceId_fkey";
ALTER TABLE "projects" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_workspaceId_fkey";
ALTER TABLE "tasks" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_boards" DROP CONSTRAINT IF EXISTS "task_boards_workspaceId_fkey";
ALTER TABLE "task_boards" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "task_boards" ADD CONSTRAINT "task_boards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meetings" DROP CONSTRAINT IF EXISTS "meetings_workspaceId_fkey";
ALTER TABLE "meetings" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "time_entries" DROP CONSTRAINT IF EXISTS "time_entries_workspaceId_fkey";
ALTER TABLE "time_entries" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_workspaceId_fkey";
ALTER TABLE "expenses" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "threads" DROP CONSTRAINT IF EXISTS "threads_workspaceId_fkey";
ALTER TABLE "threads" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "threads" ADD CONSTRAINT "threads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_workspaceId_fkey";
ALTER TABLE "notifications" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "push_subscriptions_workspaceId_fkey";
ALTER TABLE "push_subscriptions" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "intake_forms" DROP CONSTRAINT IF EXISTS "intake_forms_workspaceId_fkey";
ALTER TABLE "intake_forms" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_rules" DROP CONSTRAINT IF EXISTS "automation_rules_workspaceId_fkey";
ALTER TABLE "automation_rules" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_workflows" DROP CONSTRAINT IF EXISTS "automation_workflows_workspaceId_fkey";
ALTER TABLE "automation_workflows" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "automation_workflows" ADD CONSTRAINT "automation_workflows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_runs" DROP CONSTRAINT IF EXISTS "workflow_runs_workspaceId_fkey";
ALTER TABLE "workflow_runs" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_templates" DROP CONSTRAINT IF EXISTS "email_templates_workspaceId_fkey";
ALTER TABLE "email_templates" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attachments" DROP CONSTRAINT IF EXISTS "attachments_workspaceId_fkey";
ALTER TABLE "attachments" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_notes" DROP CONSTRAINT IF EXISTS "client_notes_workspaceId_fkey";
ALTER TABLE "client_notes" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_notes" DROP CONSTRAINT IF EXISTS "project_notes_workspaceId_fkey";
ALTER TABLE "project_notes" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proposal_templates" DROP CONSTRAINT IF EXISTS "proposal_templates_workspaceId_fkey";
ALTER TABLE "proposal_templates" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "proposal_templates" ADD CONSTRAINT "proposal_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_logs" DROP CONSTRAINT IF EXISTS "email_logs_workspaceId_fkey";
ALTER TABLE "email_logs" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_events" DROP CONSTRAINT IF EXISTS "billing_events_workspaceId_fkey";
ALTER TABLE "billing_events" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "promo_redemptions" DROP CONSTRAINT IF EXISTS "promo_redemptions_workspaceId_fkey";
ALTER TABLE "promo_redemptions" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public_profile_enquiries" DROP CONSTRAINT IF EXISTS "public_profile_enquiries_workspaceId_fkey";
ALTER TABLE "public_profile_enquiries" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "public_profile_enquiries" ADD CONSTRAINT "public_profile_enquiries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_expense_categories" DROP CONSTRAINT IF EXISTS "user_expense_categories_workspaceId_fkey";
ALTER TABLE "user_expense_categories" RENAME COLUMN "workspaceId" TO "userId";
ALTER TABLE "user_expense_categories" ADD CONSTRAINT "user_expense_categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
