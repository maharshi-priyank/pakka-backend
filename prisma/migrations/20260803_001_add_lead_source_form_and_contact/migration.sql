-- Website lead capture: tag leads to the form they came from, and mark
-- converted leads with the Contact they became. Both nullable/additive --
-- every existing manual/AI-discovered lead row simply has both as NULL.

ALTER TABLE "leads" ADD COLUMN "sourceFormId" TEXT REFERENCES "intake_forms"("id") ON DELETE SET NULL;
ALTER TABLE "leads" ADD COLUMN "contactId"    TEXT REFERENCES "contacts"("id") ON DELETE SET NULL;

CREATE INDEX ON "leads"("sourceFormId");
CREATE INDEX ON "leads"("contactId");

-- The autoCreateLead toggle is removed -- every form submission now always
-- creates a pending Lead (see forms.service.ts).
ALTER TABLE "intake_forms" DROP COLUMN "autoCreateLead";
