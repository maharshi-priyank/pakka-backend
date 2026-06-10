-- AlterTable
ALTER TABLE "users" ADD COLUMN     "googleFormsWebhookToken" TEXT,
ADD COLUMN     "googleFormsConnected" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "users_googleFormsWebhookToken_key" ON "users"("googleFormsWebhookToken");
