-- Generalize the email-only log table into a channel-agnostic communication
-- log, ready to hold WhatsApp/SMS rows later without another rename. EmailLog
-- has exactly one consumer (EmailService) — safe to rename with no data loss.

CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL');

ALTER TABLE "email_logs" RENAME TO "communication_logs";

ALTER TABLE "communication_logs"
  ADD COLUMN "contactId" TEXT,
  ADD COLUMN "body" TEXT,
  ADD COLUMN "channel" "CommunicationChannel" NOT NULL DEFAULT 'EMAIL';

ALTER TABLE "communication_logs"
  ADD CONSTRAINT "communication_logs_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL;

CREATE INDEX "communication_logs_contactId_idx" ON "communication_logs"("contactId");
