-- Phase 1: Add Workspace + WorkspaceMember tables + activeWorkspaceId on users
-- Additive only — no existing columns changed
-- Column names use Prisma convention: quoted camelCase

CREATE TABLE "workspaces" (
  "id"                  TEXT NOT NULL,
  "name"                TEXT NOT NULL,
  "logoUrl"             TEXT,
  "businessName"        TEXT,
  "gstNumber"           TEXT,
  "panNumber"           TEXT,
  "businessType"        TEXT,
  "razorpayAccountId"   TEXT,
  "razorpayKeyId"       TEXT,
  "razorpayKeySecret"   TEXT,
  "bankName"            TEXT,
  "bankAccountName"     TEXT,
  "bankAccountNumber"   TEXT,
  "bankIfsc"            TEXT,
  "upiId"               TEXT,
  "upiQrUrl"            TEXT,
  "country"             TEXT,
  "currency"            TEXT,
  "taxLabel"            TEXT,
  "ibanNumber"          TEXT,
  "swiftCode"           TEXT,
  "routingNumber"       TEXT,
  "defaultHsnSac"       TEXT,
  "defaultLutNumber"    TEXT,
  "emailSignature"      TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_members" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "role"        TEXT NOT NULL DEFAULT 'MEMBER',
  "joinedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_members_userId_workspaceId_key" UNIQUE ("userId", "workspaceId")
);

CREATE INDEX "workspace_members_userId_idx"      ON "workspace_members"("userId");
CREATE INDEX "workspace_members_workspaceId_idx" ON "workspace_members"("workspaceId");

-- Add activeWorkspaceId to users (nullable — set when user switches workspace)
ALTER TABLE "users" ADD COLUMN "activeWorkspaceId" TEXT;

-- FK constraints added after seed so they don't block the INSERT
-- (workspaces must exist before workspace_members FKs can be added)

-- Seed workspaces from existing owner users (id = user.id — ID-aliasing)
INSERT INTO "workspaces" (
  "id", "name", "logoUrl", "businessName", "gstNumber", "panNumber", "businessType",
  "razorpayAccountId", "razorpayKeyId", "razorpayKeySecret",
  "bankName", "bankAccountName", "bankAccountNumber", "bankIfsc",
  "upiId", "upiQrUrl", "country", "currency", "taxLabel",
  "ibanNumber", "swiftCode", "routingNumber",
  "defaultHsnSac", "defaultLutNumber", "emailSignature",
  "createdAt", "updatedAt"
)
SELECT
  "id",
  COALESCE("businessName", "name"),
  "logoUrl", "businessName", "gstNumber", "panNumber", "businessType",
  "razorpayAccountId", "razorpayKeyId", "razorpayKeySecret",
  "bankName", "bankAccountName", "bankAccountNumber", "bankIfsc",
  "upiId", "upiQrUrl", "country", "currency", "taxLabel",
  "ibanNumber", "swiftCode", "routingNumber",
  "defaultHsnSac", "defaultLutNumber", "emailSignature",
  "createdAt", "updatedAt"
FROM "users"
WHERE "ownerId" IS NULL;

-- Seed WorkspaceMember: owners
INSERT INTO "workspace_members" ("id", "userId", "workspaceId", "role", "joinedAt")
SELECT gen_random_uuid()::text, "id", "id", 'OWNER', "createdAt"
FROM "users" WHERE "ownerId" IS NULL;

-- Seed WorkspaceMember: team members join their owner's workspace
INSERT INTO "workspace_members" ("id", "userId", "workspaceId", "role", "joinedAt")
SELECT gen_random_uuid()::text, "id", "ownerId", 'MEMBER', "createdAt"
FROM "users" WHERE "ownerId" IS NOT NULL;

-- Set activeWorkspaceId for each user to their primary workspace
UPDATE "users" u
SET "activeWorkspaceId" = COALESCE(u."ownerId", u."id")
WHERE EXISTS (SELECT 1 FROM "workspaces" w WHERE w."id" = COALESCE(u."ownerId", u."id"));

-- Add FK constraints after seed
ALTER TABLE "workspace_members"
  ADD CONSTRAINT "workspace_members_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_members"
  ADD CONSTRAINT "workspace_members_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "users"
  ADD CONSTRAINT "users_activeWorkspaceId_fkey"
    FOREIGN KEY ("activeWorkspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
