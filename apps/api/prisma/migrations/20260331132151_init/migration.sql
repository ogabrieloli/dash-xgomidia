-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('AGENCY_ADMIN', 'AGENCY_MANAGER', 'CLIENT_VIEWER');

-- CreateEnum
CREATE TYPE "FunnelType" AS ENUM ('WEBINAR', 'DIRECT_SALE', 'LEAD_GENERATION', 'ECOMMERCE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('META_ADS', 'GOOGLE_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCING', 'SUCCESS', 'ERROR');

-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('ALERT', 'SUGGESTION', 'SUMMARY', 'COMPARISON');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "InsightSource" AS ENUM ('RULES_ENGINE', 'LLM');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('PDF', 'PPT', 'WEB');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'ERROR');

-- CreateEnum
CREATE TYPE "TimelineEntryType" AS ENUM ('ACTION', 'MEETING', 'OPTIMIZATION', 'NOTE', 'ALERT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "agencyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientUserAccess" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ClientUserAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "funnelType" "FunnelType" NOT NULL,
    "metricConfig" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "vaultSecretPath" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "lastSyncAt" TIMESTAMP(3),
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "strategyId" TEXT,
    "date" DATE NOT NULL,
    "platform" "Platform" NOT NULL,
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "spend" DECIMAL(12,2) NOT NULL,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "strategyId" TEXT,
    "type" "InsightType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source" "InsightSource" NOT NULL,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "strategyId" TEXT,
    "title" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT,
    "shareToken" TEXT,
    "shareExpiresAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEntry" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" "TimelineEntryType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_agencyId_idx" ON "User"("agencyId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Agency_slug_key" ON "Agency"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Client_slug_key" ON "Client"("slug");

-- CreateIndex
CREATE INDEX "Client_agencyId_idx" ON "Client"("agencyId");

-- CreateIndex
CREATE INDEX "Client_slug_idx" ON "Client"("slug");

-- CreateIndex
CREATE INDEX "ClientUserAccess_userId_idx" ON "ClientUserAccess"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientUserAccess_clientId_userId_key" ON "ClientUserAccess"("clientId", "userId");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Strategy_projectId_idx" ON "Strategy"("projectId");

-- CreateIndex
CREATE INDEX "AdAccount_clientId_idx" ON "AdAccount"("clientId");

-- CreateIndex
CREATE INDEX "AdAccount_syncStatus_idx" ON "AdAccount"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_clientId_platform_externalId_key" ON "AdAccount"("clientId", "platform", "externalId");

-- CreateIndex
CREATE INDEX "MetricSnapshot_adAccountId_date_idx" ON "MetricSnapshot"("adAccountId", "date");

-- CreateIndex
CREATE INDEX "MetricSnapshot_strategyId_date_idx" ON "MetricSnapshot"("strategyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MetricSnapshot_adAccountId_date_platform_key" ON "MetricSnapshot"("adAccountId", "date", "platform");

-- CreateIndex
CREATE INDEX "AiInsight_clientId_createdAt_idx" ON "AiInsight"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "AiInsight_strategyId_createdAt_idx" ON "AiInsight"("strategyId", "createdAt");

-- CreateIndex
CREATE INDEX "AiInsight_source_severity_idx" ON "AiInsight"("source", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "Report_shareToken_key" ON "Report"("shareToken");

-- CreateIndex
CREATE INDEX "Report_clientId_status_idx" ON "Report"("clientId", "status");

-- CreateIndex
CREATE INDEX "Report_shareToken_idx" ON "Report"("shareToken");

-- CreateIndex
CREATE INDEX "TimelineEntry_clientId_occurredAt_idx" ON "TimelineEntry"("clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientUserAccess" ADD CONSTRAINT "ClientUserAccess_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientUserAccess" ADD CONSTRAINT "ClientUserAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
