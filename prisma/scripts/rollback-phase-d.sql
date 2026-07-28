-- Phase D rollback: reverses NOT NULL constraints and Thread unique index swap.
-- Run ONLY if Phase D needs to be undone (before Phase E).
--
-- Apply with:
--   psql $DATABASE_URL -f prisma/scripts/rollback-phase-d.sql

BEGIN;

-- ── Re-allow NULLs on contactId columns (reverse of Phase D NOT NULL adds) ───

ALTER TABLE "projects"     ALTER COLUMN "contactId" DROP NOT NULL;
ALTER TABLE "proposals"    ALTER COLUMN "contactId" DROP NOT NULL;
ALTER TABLE "contracts"    ALTER COLUMN "contactId" DROP NOT NULL;
ALTER TABLE "invoices"     ALTER COLUMN "contactId" DROP NOT NULL;
ALTER TABLE "meetings"     ALTER COLUMN "contactId" DROP NOT NULL;
ALTER TABLE "time_entries" ALTER COLUMN "contactId" DROP NOT NULL;
ALTER TABLE "expenses"     ALTER COLUMN "contactId" DROP NOT NULL;
ALTER TABLE "attachments"  ALTER COLUMN "contactId" DROP NOT NULL;
ALTER TABLE "threads"      ALTER COLUMN "contactId" DROP NOT NULL;
ALTER TABLE "client_notes" ALTER COLUMN "contactId" DROP NOT NULL;

-- ── Reverse Thread unique index swap ─────────────────────────────────────────
-- Phase D drops the old (workspaceId, clientId) unique index and adds
-- (workspaceId, contactId) unique index. This reverses that swap.

-- Drop the new index added in Phase D (if it exists)
DROP INDEX IF EXISTS "threads_workspaceId_contactId_key";

-- Re-add the legacy unique constraint on (workspaceId, clientId)
-- (only if it was dropped in Phase D and doesn't already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'threads_workspaceId_clientId_key'
      AND conrelid = 'threads'::regclass
  ) THEN
    ALTER TABLE "threads" ADD CONSTRAINT "threads_workspaceId_clientId_key"
      UNIQUE ("workspaceId", "clientId");
  END IF;
END $$;

-- ── Restore Thread.clientId NOT NULL (was made nullable in Phase A) ───────────
-- WARNING: Only run this if clientId is fully populated for all threads.
-- If any thread has contactId but no clientId, this will fail.
-- Comment out if Phase C created contactId-only threads.
-- ALTER TABLE "threads" ALTER COLUMN "clientId" SET NOT NULL;

COMMIT;
