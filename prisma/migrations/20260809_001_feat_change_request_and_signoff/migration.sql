-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING_REVIEW', 'RESOLVED_IN_SCOPE', 'NOT_FEASIBLE', 'ADDITIONAL_COST_PENDING', 'APPROVED_INVOICE_SENT', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalRequestKind" AS ENUM ('CHANGE_REQUEST_COST', 'PROJECT_SIGNOFF');

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED');

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "changeRequestId" TEXT;

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "otpEmailSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "otpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "otpFailedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "otpHash" TEXT,
ADD COLUMN     "otpLastSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "change_requests" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "raisedByEmail" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "attachmentId" TEXT,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "freelancerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "kind" "ApprovalRequestKind" NOT NULL,
    "requiresOtp" BOOLEAN NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "changeRequestId" TEXT,
    "amount" DECIMAL(12,2),
    "description" TEXT,
    "invoiceId" TEXT,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpEmailSent" BOOLEAN NOT NULL DEFAULT false,
    "otpLastSentAt" TIMESTAMP(3),
    "otpFailedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "auditLog" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "change_requests_projectId_idx" ON "change_requests"("projectId");

-- CreateIndex
CREATE INDEX "change_requests_workspaceId_idx" ON "change_requests"("workspaceId");

-- CreateIndex
CREATE INDEX "approval_requests_projectId_idx" ON "approval_requests"("projectId");

-- CreateIndex
CREATE INDEX "approval_requests_workspaceId_idx" ON "approval_requests"("workspaceId");

-- CreateIndex
CREATE INDEX "approval_requests_changeRequestId_idx" ON "approval_requests"("changeRequestId");

-- CreateIndex
CREATE INDEX "approval_requests_invoiceId_idx" ON "approval_requests"("invoiceId");

-- CreateIndex
CREATE INDEX "attachments_changeRequestId_idx" ON "attachments"("changeRequestId");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enforce: at most one PENDING sign-off per project
CREATE UNIQUE INDEX uq_signoff_pending
  ON "approval_requests" ("projectId", kind)
  WHERE status = 'PENDING' AND kind = 'PROJECT_SIGNOFF';

-- Enforce: at most one PENDING cost-approval per ChangeRequest
CREATE UNIQUE INDEX uq_cr_cost_pending
  ON "approval_requests" ("changeRequestId")
  WHERE status = 'PENDING' AND "changeRequestId" IS NOT NULL;
