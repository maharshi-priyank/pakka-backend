-- Add archivedAt to all parent entity tables
ALTER TABLE "clients"      ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "leads"        ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "projects"     ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "proposals"    ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "contracts"    ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "task_boards"  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "intake_forms" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- Migrate leads: set archivedAt for existing soft-deleted leads
UPDATE "leads" SET "archivedAt" = NOW() WHERE "isDeleted" = true AND "archivedAt" IS NULL;

-- Add VOID to ContractStatus enum
ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'VOID';
