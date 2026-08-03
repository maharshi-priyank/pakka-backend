-- Scopes lead capture to forms created for that purpose (the Website Leads
-- page), rather than every form in the generic Forms builder. Existing
-- forms default to false -- no behavior change for forms already live.

ALTER TABLE "intake_forms" ADD COLUMN "capturesLeads" BOOLEAN NOT NULL DEFAULT false;
