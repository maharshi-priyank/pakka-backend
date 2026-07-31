-- R1/R4: per-contact currency/country, inherited by Proposal/Contract/Invoice (KTD1, KTD8).
-- Nullable, no default -- existing rows start NULL and are resolved dynamically at
-- read time by resolveDocumentCurrency() (KTD5, KTD7), never backfilled.

ALTER TABLE "contacts"
  ADD COLUMN "country" TEXT,
  ADD COLUMN "currency" TEXT;

ALTER TABLE "proposals"
  ADD COLUMN "currency" TEXT;

ALTER TABLE "contracts"
  ADD COLUMN "currency" TEXT;
