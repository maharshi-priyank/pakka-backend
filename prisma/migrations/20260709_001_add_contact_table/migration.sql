-- Migration 001: Contact table and new enums (Phase A — additive only)

-- Add ContactStage enum
CREATE TYPE "ContactStage" AS ENUM ('ENQUIRY','PROPOSAL_SENT','NEGOTIATING','CLIENT','PAST_CLIENT','LOST');

-- Add ProjectStage enum
CREATE TYPE "ProjectStage" AS ENUM ('SCOPING','PROPOSAL_SENT','ACTIVE','COMPLETED','ON_HOLD','CANCELLED');

-- Create contacts table
CREATE TABLE "contacts" (
  "id"              TEXT PRIMARY KEY,
  "workspaceId"     TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name"            TEXT NOT NULL,
  "email"           TEXT,
  "phone"           TEXT,
  "company"         TEXT,
  "gstNumber"       TEXT,
  "state"           TEXT,
  "portalToken"     TEXT UNIQUE,
  "clickupMemberId" TEXT,
  "source"          TEXT,
  "service"         TEXT,
  "dealValue"       DECIMAL(12,2),
  "followUpAt"      TIMESTAMPTZ,
  "lastActivityAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "stage"           "ContactStage" NOT NULL DEFAULT 'ENQUIRY',
  "archivedAt"      TIMESTAMPTZ,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON "contacts"("workspaceId");
CREATE INDEX ON "contacts"("workspaceId", "archivedAt", "stage");
CREATE INDEX ON "contacts"("workspaceId", "followUpAt");
COMMENT ON COLUMN "contacts"."clickupMemberId" IS 'workspace-scoped unique index below';
CREATE UNIQUE INDEX ON "contacts"("workspaceId", "clickupMemberId") WHERE "clickupMemberId" IS NOT NULL;
