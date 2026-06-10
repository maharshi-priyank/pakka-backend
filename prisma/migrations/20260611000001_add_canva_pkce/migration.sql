ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "canvaPkceState"      TEXT,
  ADD COLUMN IF NOT EXISTS "canvaPkceVerifier"   TEXT,
  ADD COLUMN IF NOT EXISTS "canvaPkceExpiresAt"  TIMESTAMP(3);
