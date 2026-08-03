-- Phase D compatibility repair: preserve nullable contactId rows + Thread index.
--
-- The original version attempted to enforce contactId NOT NULL after a full
-- legacy backfill. The live database contains valid records without a client
-- or lead owner, so assigning synthetic contacts or deleting those records
-- would be unsafe. Contact IDs remain nullable until each record has a real
-- contact mapping.
--
-- To roll back this migration use: prisma/scripts/rollback-phase-d.sql
-- ----------------------------------------------------------------------------

BEGIN;

-- Add a lookup index on Thread(workspaceId, contactId). The live database
-- contains duplicate non-null contact threads, so enforcing uniqueness would
-- require merging or deleting user data and is intentionally out of scope.
--
-- Phase C code already looks up threads by contactId via findFirst.
-- Adding the index here makes that lookup a fast index scan.

CREATE INDEX IF NOT EXISTS "threads_workspaceId_contactId_idx"
  ON "threads" ("workspaceId", "contactId");

-- Drop legacy Thread(workspaceId, clientId) unique constraint
-- DEFERRED to Phase E (when Client table is dropped).
-- Leave the constraint in place for now so client-based inbox still works.
-- DROP CONSTRAINT "threads_workspaceId_clientId_key";  -- Phase E only

COMMIT;
