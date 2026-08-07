-- Add sentAt to proposals for accurate automation scheduling
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
