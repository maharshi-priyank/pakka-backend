-- Migration 002: Nullable contactId FK columns on all tables (Phase A — additive only, zero drops)

ALTER TABLE "projects"       ADD COLUMN "contactId"    TEXT REFERENCES "contacts"("id") ON DELETE SET NULL;
ALTER TABLE "projects"       ADD COLUMN "projectStage" "ProjectStage";
ALTER TABLE "proposals"      ADD COLUMN "contactId"    TEXT REFERENCES "contacts"("id") ON DELETE SET NULL;
ALTER TABLE "contracts"      ADD COLUMN "contactId"    TEXT REFERENCES "contacts"("id") ON DELETE SET NULL;
ALTER TABLE "invoices"       ADD COLUMN "contactId"    TEXT REFERENCES "contacts"("id") ON DELETE SET NULL;
ALTER TABLE "meetings"       ADD COLUMN "contactId"    TEXT REFERENCES "contacts"("id") ON DELETE SET NULL;
ALTER TABLE "meetings"       ADD COLUMN "projectId"    TEXT REFERENCES "projects"("id") ON DELETE SET NULL;
ALTER TABLE "time_entries"   ADD COLUMN "contactId"    TEXT REFERENCES "contacts"("id") ON DELETE SET NULL;
ALTER TABLE "expenses"       ADD COLUMN "contactId"    TEXT REFERENCES "contacts"("id") ON DELETE SET NULL;
ALTER TABLE "attachments"    ADD COLUMN "contactId"    TEXT REFERENCES "contacts"("id") ON DELETE CASCADE;
ALTER TABLE "threads"        ADD COLUMN "contactId"    TEXT REFERENCES "contacts"("id") ON DELETE CASCADE;
ALTER TABLE "client_notes"   ADD COLUMN "contactId"    TEXT REFERENCES "contacts"("id") ON DELETE CASCADE;
ALTER TABLE "discovered_leads" ADD COLUMN "importedAsContactId" TEXT;

-- Make Thread.clientId nullable (Phase A — required before Phase C new-contact creates)
ALTER TABLE "threads" ALTER COLUMN "clientId" DROP NOT NULL;

-- Make ClientNote.clientId nullable (Phase A — contacts-without-clients need notes in Phase C)
ALTER TABLE "client_notes" ALTER COLUMN "clientId" DROP NOT NULL;

-- Indexes
CREATE INDEX ON "projects"("contactId");
CREATE INDEX ON "proposals"("contactId");
CREATE INDEX ON "contracts"("contactId");
CREATE INDEX ON "invoices"("contactId");
CREATE INDEX ON "meetings"("contactId");
CREATE INDEX ON "meetings"("projectId");
CREATE INDEX ON "time_entries"("contactId");
CREATE INDEX ON "expenses"("contactId");
CREATE INDEX ON "attachments"("contactId");
CREATE INDEX ON "threads"("contactId");
CREATE INDEX ON "client_notes"("contactId");
