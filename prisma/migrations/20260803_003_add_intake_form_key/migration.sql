-- Deterministic lookup for the one seeded lead-capture form per workspace,
-- mirroring ContractTemplate.key exactly. Nullable so existing forms don't
-- collide with each other under the unique constraint (Postgres treats each
-- NULL as distinct).

ALTER TABLE "intake_forms" ADD COLUMN "key" TEXT;

CREATE UNIQUE INDEX "intake_forms_workspaceId_key_key" ON "intake_forms"("workspaceId", "key");
