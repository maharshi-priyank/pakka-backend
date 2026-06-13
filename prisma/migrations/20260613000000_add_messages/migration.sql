-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('FREELANCER', 'CLIENT');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('PROPOSAL', 'INVOICE', 'CONTRACT');

-- CreateTable
CREATE TABLE "threads" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "clientId"  TEXT NOT NULL,
    "subject"   TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id"             TEXT NOT NULL,
    "threadId"       TEXT NOT NULL,
    "senderType"     "SenderType" NOT NULL,
    "body"           TEXT NOT NULL,
    "attachmentType" "AttachmentType",
    "attachmentId"   TEXT,
    "readAt"         TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "threads_userId_clientId_key" ON "threads"("userId", "clientId");

-- CreateIndex
CREATE INDEX "messages_threadId_idx" ON "messages"("threadId");

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "threads" ADD CONSTRAINT "threads_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add email signature to User
ALTER TABLE "users" ADD COLUMN "emailSignature" TEXT;
