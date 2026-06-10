-- AlterTable
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "googleSheetsConnected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "googleSheetsId" TEXT;
