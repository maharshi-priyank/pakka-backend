-- WhatsApp Business Integration
-- Adds WhatsappConnection table, extends CommunicationChannel enum, adds waMessageId to CommunicationLog

-- 1. Extend CommunicationChannel enum (Postgres enum ADD VALUE is append-only, safe, no table rewrite)
ALTER TYPE "CommunicationChannel" ADD VALUE 'WHATSAPP';

-- 2. Add waMessageId column to communication_logs for Meta delivery webhook correlation
ALTER TABLE "communication_logs" ADD COLUMN "wa_message_id" TEXT;
CREATE INDEX "communication_logs_wa_message_id_idx" ON "communication_logs"("wa_message_id");

-- 3. Create whatsapp_connections table
CREATE TABLE "whatsapp_connections" (
    "id"                    TEXT NOT NULL,
    "workspace_id"          TEXT NOT NULL,
    "phone_number_id"       TEXT NOT NULL,
    "business_account_id"   TEXT NOT NULL,
    "encrypted_access_token" TEXT NOT NULL,
    "display_phone"         TEXT NOT NULL,
    "is_active"             BOOLEAN NOT NULL DEFAULT true,
    "connected_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id")
);

-- 4. Unique constraint: one connection per workspace
CREATE UNIQUE INDEX "whatsapp_connections_workspace_id_key" ON "whatsapp_connections"("workspace_id");

-- 5. Foreign key to workspaces
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
