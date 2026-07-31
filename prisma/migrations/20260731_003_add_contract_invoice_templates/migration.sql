-- R1/R4/KTD2: ContractTemplate/InvoiceTemplate mirror ProposalTemplate but add
-- isDefault/isSystem/key -- system templates here are real per-workspace rows
-- (not a virtual constant like ProposalTemplate's SYSTEM_TEMPLATES) because
-- isDefault needs mutable per-workspace state. `key` is nullable and unique
-- per workspace (KTD4's seed-idempotency marker; NULL for user-created rows,
-- Postgres treats each NULL as distinct so they never collide).

CREATE TABLE "contract_templates" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "key"         TEXT,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "category"    TEXT,
  "content"     JSONB NOT NULL,
  "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "usageCount"  INTEGER NOT NULL DEFAULT 0,
  "isDefault"   BOOLEAN NOT NULL DEFAULT false,
  "isSystem"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_templates" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "key"         TEXT,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "category"    TEXT,
  "content"     JSONB NOT NULL,
  "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "usageCount"  INTEGER NOT NULL DEFAULT 0,
  "isDefault"   BOOLEAN NOT NULL DEFAULT false,
  "isSystem"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "invoice_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_templates_workspaceId_key_key" ON "contract_templates"("workspaceId", "key");
CREATE INDEX "contract_templates_workspaceId_idx" ON "contract_templates"("workspaceId");

CREATE UNIQUE INDEX "invoice_templates_workspaceId_key_key" ON "invoice_templates"("workspaceId", "key");
CREATE INDEX "invoice_templates_workspaceId_idx" ON "invoice_templates"("workspaceId");

ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_templates" ADD CONSTRAINT "invoice_templates_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- KTD6: dead-end-to-end today (DTO/frontend schema declare it, service never
-- persists it) -- this makes it real, and Invoice's template boilerplate slot.
ALTER TABLE "invoices"
  ADD COLUMN "notes" TEXT;
