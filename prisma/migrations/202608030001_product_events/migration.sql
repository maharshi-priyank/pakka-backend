ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acquisitionSource" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "acquisitionMedium" TEXT,
  ADD COLUMN IF NOT EXISTS "acquisitionCampaign" TEXT,
  ADD COLUMN IF NOT EXISTS "acquisitionContent" TEXT,
  ADD COLUMN IF NOT EXISTS "acquisitionTerm" TEXT;

CREATE TABLE IF NOT EXISTS "product_events" (
  "id" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "eventVersion" INTEGER NOT NULL DEFAULT 1,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "properties" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "product_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_events_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_events_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_events_userId_idempotencyKey_key"
  ON "product_events"("userId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "product_events_eventName_occurredAt_idx"
  ON "product_events"("eventName", "occurredAt");
CREATE INDEX IF NOT EXISTS "product_events_userId_occurredAt_idx"
  ON "product_events"("userId", "occurredAt");
CREATE INDEX IF NOT EXISTS "product_events_workspaceId_occurredAt_idx"
  ON "product_events"("workspaceId", "occurredAt");
