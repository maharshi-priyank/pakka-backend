-- Migration: add_db_indexes
-- Adds composite indexes, FK indexes, and partial indexes across all business models.
-- All CREATE INDEX use CONCURRENTLY to avoid table locks in production.

-- Clients
CREATE INDEX IF NOT EXISTS "clients_userId_idx" ON "clients"("userId");
CREATE INDEX IF NOT EXISTS "clients_userId_archivedAt_idx" ON "clients"("userId", "archivedAt");

-- Leads
CREATE INDEX IF NOT EXISTS "leads_userId_idx" ON "leads"("userId");
CREATE INDEX IF NOT EXISTS "leads_userId_archivedAt_stage_idx" ON "leads"("userId", "archivedAt", "stage");
CREATE INDEX IF NOT EXISTS "leads_userId_followUpAt_idx" ON "leads"("userId", "followUpAt");
CREATE INDEX IF NOT EXISTS "leads_clientId_idx" ON "leads"("clientId");

-- Proposals
CREATE INDEX IF NOT EXISTS "proposals_userId_status_idx" ON "proposals"("userId", "status");
CREATE INDEX IF NOT EXISTS "proposals_userId_archivedAt_idx" ON "proposals"("userId", "archivedAt");
CREATE INDEX IF NOT EXISTS "proposals_clientId_idx" ON "proposals"("clientId");
CREATE INDEX IF NOT EXISTS "proposals_projectId_idx" ON "proposals"("projectId");
CREATE INDEX IF NOT EXISTS "proposals_leadId_idx" ON "proposals"("leadId");

-- Proposal opens (FK)
CREATE INDEX IF NOT EXISTS "proposal_opens_proposalId_idx" ON "proposal_opens"("proposalId");

-- Contracts
CREATE INDEX IF NOT EXISTS "contracts_userId_status_idx" ON "contracts"("userId", "status");
CREATE INDEX IF NOT EXISTS "contracts_userId_archivedAt_idx" ON "contracts"("userId", "archivedAt");
CREATE INDEX IF NOT EXISTS "contracts_clientId_idx" ON "contracts"("clientId");
CREATE INDEX IF NOT EXISTS "contracts_projectId_idx" ON "contracts"("projectId");
CREATE INDEX IF NOT EXISTS "contracts_proposalId_idx" ON "contracts"("proposalId");

-- Invoices
CREATE INDEX IF NOT EXISTS "invoices_userId_status_idx" ON "invoices"("userId", "status");
CREATE INDEX IF NOT EXISTS "invoices_userId_dueDate_idx" ON "invoices"("userId", "dueDate");
CREATE INDEX IF NOT EXISTS "invoices_clientId_idx" ON "invoices"("clientId");
CREATE INDEX IF NOT EXISTS "invoices_projectId_idx" ON "invoices"("projectId");
CREATE INDEX IF NOT EXISTS "invoices_contractId_idx" ON "invoices"("contractId");
CREATE INDEX IF NOT EXISTS "invoices_parentInvoiceId_idx" ON "invoices"("parentInvoiceId");

-- Automation executions (FK)
CREATE INDEX IF NOT EXISTS "automation_executions_ruleId_idx" ON "automation_executions"("ruleId");

-- Meetings
CREATE INDEX IF NOT EXISTS "meetings_userId_clientId_idx" ON "meetings"("userId", "clientId");
CREATE INDEX IF NOT EXISTS "meetings_userId_scheduledAt_idx" ON "meetings"("userId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "meetings_leadId_idx" ON "meetings"("leadId");

-- Proposal templates
CREATE INDEX IF NOT EXISTS "proposal_templates_userId_idx" ON "proposal_templates"("userId");

-- Time entries
CREATE INDEX IF NOT EXISTS "time_entries_userId_idx" ON "time_entries"("userId");
CREATE INDEX IF NOT EXISTS "time_entries_userId_date_idx" ON "time_entries"("userId", "date");
CREATE INDEX IF NOT EXISTS "time_entries_projectId_idx" ON "time_entries"("projectId");
CREATE INDEX IF NOT EXISTS "time_entries_clientId_idx" ON "time_entries"("clientId");

-- Expenses
CREATE INDEX IF NOT EXISTS "expenses_userId_idx" ON "expenses"("userId");
CREATE INDEX IF NOT EXISTS "expenses_userId_date_idx" ON "expenses"("userId", "date");
CREATE INDEX IF NOT EXISTS "expenses_projectId_idx" ON "expenses"("projectId");
CREATE INDEX IF NOT EXISTS "expenses_clientId_idx" ON "expenses"("clientId");

-- Projects
CREATE INDEX IF NOT EXISTS "projects_userId_status_idx" ON "projects"("userId", "status");
CREATE INDEX IF NOT EXISTS "projects_userId_archivedAt_idx" ON "projects"("userId", "archivedAt");
CREATE INDEX IF NOT EXISTS "projects_clientId_idx" ON "projects"("clientId");

-- Client notes
CREATE INDEX IF NOT EXISTS "client_notes_userId_clientId_idx" ON "client_notes"("userId", "clientId");

-- Project notes
CREATE INDEX IF NOT EXISTS "project_notes_userId_projectId_idx" ON "project_notes"("userId", "projectId");

-- Attachments
CREATE INDEX IF NOT EXISTS "attachments_userId_idx" ON "attachments"("userId");
CREATE INDEX IF NOT EXISTS "attachments_clientId_idx" ON "attachments"("clientId");
CREATE INDEX IF NOT EXISTS "attachments_projectId_idx" ON "attachments"("projectId");
CREATE INDEX IF NOT EXISTS "attachments_invoiceId_idx" ON "attachments"("invoiceId");
CREATE INDEX IF NOT EXISTS "attachments_proposalId_idx" ON "attachments"("proposalId");

-- Partial indexes (not expressible in Prisma DSL — applied as raw SQL)
-- Smaller and faster than full indexes for the common "active only" query patterns
CREATE INDEX IF NOT EXISTS "clients_active_userId_idx"  ON "clients"("userId")         WHERE "archivedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "leads_active_userId_idx"    ON "leads"("userId", "stage")   WHERE "archivedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "invoices_open_userId_idx"   ON "invoices"("userId", "dueDate") WHERE status IN ('SENT', 'OVERDUE');
CREATE INDEX IF NOT EXISTS "projects_active_userId_idx" ON "projects"("userId", "status") WHERE "archivedAt" IS NULL;
