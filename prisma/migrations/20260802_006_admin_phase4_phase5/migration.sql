CREATE TYPE "AdminUserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INVITED');
CREATE TYPE "AdminIncidentSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "AdminIncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'REOPENED');
CREATE TYPE "AdminIncidentSource" AS ENUM ('BILLING', 'AUTOMATION', 'WORKFLOW', 'COMMUNICATION', 'INTEGRATION', 'SECURITY', 'DATABASE', 'SYSTEM', 'MANUAL');
CREATE TYPE "AdminCustomerTargetType" AS ENUM ('USER', 'WORKSPACE');
CREATE TYPE "AdminCustomerTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

ALTER TABLE "admin_users"
  ADD COLUMN "status" "AdminUserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "suspended_at" TIMESTAMP(3),
  ADD COLUMN "suspended_by_id" TEXT,
  ADD COLUMN "suspension_reason" TEXT,
  ADD COLUMN "failed_login_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "locked_until" TIMESTAMP(3),
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "admin_sessions" (
  "id" TEXT NOT NULL,
  "admin_id" TEXT NOT NULL,
  "jti" TEXT NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "revoked_at" TIMESTAMP(3),
  "revoke_reason" TEXT,
  CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "admin_sessions_jti_key" ON "admin_sessions"("jti");
CREATE INDEX "admin_sessions_admin_id_revoked_at_idx" ON "admin_sessions"("admin_id", "revoked_at");
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");

CREATE TABLE "admin_incidents" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "source" "AdminIncidentSource" NOT NULL,
  "service" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "severity" "AdminIncidentSeverity" NOT NULL DEFAULT 'WARNING',
  "status" "AdminIncidentStatus" NOT NULL DEFAULT 'OPEN',
  "workspace_id" TEXT,
  "owner_admin_id" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMP(3),
  "resolved_at" TIMESTAMP(3),
  "resolution" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_incidents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_incidents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "admin_incidents_owner_admin_id_fkey" FOREIGN KEY ("owner_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "admin_incidents_fingerprint_idx" ON "admin_incidents"("fingerprint");
CREATE INDEX "admin_incidents_status_severity_last_seen_at_idx" ON "admin_incidents"("status", "severity", "last_seen_at");
CREATE INDEX "admin_incidents_workspace_id_status_idx" ON "admin_incidents"("workspace_id", "status");
CREATE INDEX "admin_incidents_owner_admin_id_status_idx" ON "admin_incidents"("owner_admin_id", "status");

CREATE TABLE "admin_incident_events" (
  "id" TEXT NOT NULL,
  "incident_id" TEXT NOT NULL,
  "actor_id" TEXT,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_incident_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "admin_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "admin_incident_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "admin_incident_events_incident_id_created_at_idx" ON "admin_incident_events"("incident_id", "created_at");

CREATE TABLE "admin_customer_tasks" (
  "id" TEXT NOT NULL,
  "target_type" "AdminCustomerTargetType" NOT NULL,
  "target_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "owner_admin_id" TEXT,
  "status" "AdminCustomerTaskStatus" NOT NULL DEFAULT 'OPEN',
  "due_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_customer_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_customer_tasks_owner_admin_id_fkey" FOREIGN KEY ("owner_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "admin_customer_tasks_target_type_target_id_status_idx" ON "admin_customer_tasks"("target_type", "target_id", "status");
CREATE INDEX "admin_customer_tasks_owner_admin_id_status_due_at_idx" ON "admin_customer_tasks"("owner_admin_id", "status", "due_at");

CREATE TABLE "admin_customer_tags" (
  "id" TEXT NOT NULL,
  "target_type" "AdminCustomerTargetType" NOT NULL,
  "target_id" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_customer_tags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_customer_tags_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "admin_customer_tags_target_type_target_id_tag_key" ON "admin_customer_tags"("target_type", "target_id", "tag");
CREATE INDEX "admin_customer_tags_target_type_target_id_idx" ON "admin_customer_tags"("target_type", "target_id");
CREATE INDEX "admin_customer_tags_tag_idx" ON "admin_customer_tags"("tag");
