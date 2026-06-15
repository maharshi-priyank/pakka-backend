-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "lead_provider_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_provider_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_campaigns" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "providers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CampaignStatus" NOT NULL DEFAULT 'PENDING',
    "totalFound" INTEGER NOT NULL DEFAULT 0,
    "totalImported" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovered_leads" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "businessName" TEXT,
    "website" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "contactName" TEXT,
    "contactTitle" TEXT,
    "companySize" TEXT,
    "location" TEXT,
    "linkedinUrl" TEXT,
    "techStack" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "intentSignals" JSONB NOT NULL DEFAULT '[]',
    "intentScore" INTEGER NOT NULL DEFAULT 0,
    "importedAsLeadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovered_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_provider_keys_userId_provider_key" ON "lead_provider_keys"("userId", "provider");

-- AddForeignKey
ALTER TABLE "lead_provider_keys" ADD CONSTRAINT "lead_provider_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_campaigns" ADD CONSTRAINT "lead_campaigns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovered_leads" ADD CONSTRAINT "discovered_leads_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "lead_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
