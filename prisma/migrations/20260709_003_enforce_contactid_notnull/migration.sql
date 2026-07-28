-- Phase D: Enforce contactId NOT NULL + Thread unique index swap.
--
-- PREREQUISITES — run ONLY after ALL of the following are true:
--   1. Phase A migrations (001 + 002) applied
--   2. Phase B backfill script run: npx tsx prisma/scripts/migrate-contacts.ts
--   3. Phase B validation script passes: npx tsx prisma/scripts/validate-migration.ts
--   4. Phase C app code (contacts module, dual-write) deployed and healthy
--
-- To roll back this migration use: prisma/scripts/rollback-phase-d.sql
-- ----------------------------------------------------------------------------

BEGIN;

-- ── 1. Enforce NOT NULL on contactId across all FK tables ────────────────────
--
-- These will FAIL if any row still has contactId = NULL.
-- Run validate-migration.ts first to confirm 100% coverage.

ALTER TABLE "projects"     ALTER COLUMN "contactId" SET NOT NULL;
ALTER TABLE "proposals"    ALTER COLUMN "contactId" SET NOT NULL;
ALTER TABLE "contracts"    ALTER COLUMN "contactId" SET NOT NULL;
ALTER TABLE "invoices"     ALTER COLUMN "contactId" SET NOT NULL;
ALTER TABLE "meetings"     ALTER COLUMN "contactId" SET NOT NULL;
ALTER TABLE "time_entries" ALTER COLUMN "contactId" SET NOT NULL;
ALTER TABLE "expenses"     ALTER COLUMN "contactId" SET NOT NULL;
ALTER TABLE "attachments"  ALTER COLUMN "contactId" SET NOT NULL;
ALTER TABLE "threads"      ALTER COLUMN "contactId" SET NOT NULL;
ALTER TABLE "client_notes" ALTER COLUMN "contactId" SET NOT NULL;

-- ── 2. Add unique index on Thread(workspaceId, contactId) ────────────────────
--
-- Phase C code already looks up threads by contactId via findFirst.
-- Adding the unique index here makes that lookup a fast index scan and
-- enforces one thread per contact per workspace.

CREATE UNIQUE INDEX "threads_workspaceId_contactId_key"
  ON "threads" ("workspaceId", "contactId");

-- ── 3. Update Prisma schema @@unique marker ───────────────────────────────────
-- After running this migration, add to prisma/schema.prisma Thread model:
--   @@unique([workspaceId, contactId])
-- Then run: npx prisma generate
-- (Prisma cannot auto-detect manually created indexes without a migration.)

-- ── 4. Drop legacy Thread(workspaceId, clientId) unique constraint ────────────
-- DEFERRED to Phase E (when Client table is dropped).
-- Leave the constraint in place for now so client-based inbox still works.
-- DROP CONSTRAINT "threads_workspaceId_clientId_key";  -- Phase E only

COMMIT;
