-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "googleDocsConnected" BOOLEAN NOT NULL DEFAULT false;
