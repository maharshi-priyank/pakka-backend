-- AlterTable
ALTER TABLE "users" ADD COLUMN     "canvaAccessToken" TEXT,
ADD COLUMN     "canvaConnected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canvaRefreshToken" TEXT,
ADD COLUMN     "canvaTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "flodeskApiKey" TEXT,
ADD COLUMN     "flodeskConnected" BOOLEAN NOT NULL DEFAULT false;
