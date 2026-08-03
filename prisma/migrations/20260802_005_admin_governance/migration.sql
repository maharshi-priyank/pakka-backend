CREATE TABLE "admin_security_events" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT,
    "email" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_security_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_security_events_email_idx" ON "admin_security_events"("email");
CREATE INDEX "admin_security_events_outcome_at_idx" ON "admin_security_events"("outcome", "at");

CREATE TABLE "admin_saved_views" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_saved_views_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_saved_views_admin_id_page_idx" ON "admin_saved_views"("admin_id", "page");

CREATE TABLE "admin_alert_dismissals" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "dismissed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_alert_dismissals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_alert_dismissals_admin_id_fingerprint_key" ON "admin_alert_dismissals"("admin_id", "fingerprint");
CREATE INDEX "admin_alert_dismissals_admin_id_idx" ON "admin_alert_dismissals"("admin_id");

CREATE TABLE "admin_bulk_operations" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "target_ids" JSONB NOT NULL,
    "input" JSONB,
    "preview" JSONB,
    "result" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executed_at" TIMESTAMP(3),
    CONSTRAINT "admin_bulk_operations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_bulk_operations_admin_id_created_at_idx" ON "admin_bulk_operations"("admin_id", "created_at");
CREATE INDEX "admin_bulk_operations_status_created_at_idx" ON "admin_bulk_operations"("status", "created_at");
