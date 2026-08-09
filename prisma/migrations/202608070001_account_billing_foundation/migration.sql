-- Account-wide entitlement foundation.
-- Billing remains on User; this column only records which User owns a
-- workspace's billing account so secondary workspace IDs never masquerade as
-- subscription owners.
ALTER TABLE "workspaces" ADD COLUMN "billingOwnerId" TEXT;

UPDATE "workspaces" w
SET "billingOwnerId" = COALESCE(
  (SELECT wm."userId"
   FROM "workspace_members" wm
   WHERE wm."workspaceId" = w."id" AND wm."role" = 'OWNER'
   ORDER BY wm."joinedAt" ASC
   LIMIT 1),
  CASE WHEN EXISTS (SELECT 1 FROM "users" u WHERE u."id" = w."id") THEN w."id" ELSE NULL END
)
WHERE "billingOwnerId" IS NULL;

ALTER TABLE "workspaces"
  ADD CONSTRAINT "workspaces_billingOwnerId_fkey"
  FOREIGN KEY ("billingOwnerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "workspaces_billingOwnerId_idx" ON "workspaces"("billingOwnerId");

-- Accounts without a provider subscription receive the launch Pro grant. Rows
-- with a provider subscription are left untouched for safe rollout.
UPDATE "users"
SET "plan" = 'SOLO',
    "subscriptionStatus" = 'NONE',
    "planExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '3 months'
WHERE "razorpaySubscriptionId" IS NULL;
