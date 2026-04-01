-- AlterTable Client: add business fields
ALTER TABLE "Client" ADD COLUMN "operation" TEXT;
ALTER TABLE "Client" ADD COLUMN "alreadyInvesting" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN "initialInvestment" DECIMAL(12,2);
ALTER TABLE "Client" ADD COLUMN "reportedRevenue" DECIMAL(12,2);
ALTER TABLE "Client" ADD COLUMN "notes" TEXT;

-- AlterTable Strategy: add objective, budget, dashboardConfig
ALTER TABLE "Strategy" ADD COLUMN "objective" TEXT;
ALTER TABLE "Strategy" ADD COLUMN "budget" DECIMAL(12,2);
ALTER TABLE "Strategy" ADD COLUMN "dashboardConfig" JSONB;

-- AlterTable MetricSnapshot: add per-campaign fields
ALTER TABLE "MetricSnapshot" ADD COLUMN "externalCampaignId" TEXT;
ALTER TABLE "MetricSnapshot" ADD COLUMN "campaignName" TEXT;

-- DropIndex old unique (adAccountId, date, platform)
DROP INDEX "MetricSnapshot_adAccountId_date_platform_key";

-- CreateIndex new unique including externalCampaignId
CREATE UNIQUE INDEX "MetricSnapshot_adAccountId_date_platform_externalCampaignId_key" ON "MetricSnapshot"("adAccountId", "date", "platform", "externalCampaignId");

-- CreateIndex for campaign lookups
CREATE INDEX "MetricSnapshot_externalCampaignId_idx" ON "MetricSnapshot"("externalCampaignId");

-- CreateTable StrategyCampaign
CREATE TABLE "StrategyCampaign" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StrategyCampaign_strategyId_externalId_key" ON "StrategyCampaign"("strategyId", "externalId");

-- CreateIndex
CREATE INDEX "StrategyCampaign_strategyId_idx" ON "StrategyCampaign"("strategyId");

-- CreateIndex
CREATE INDEX "StrategyCampaign_adAccountId_idx" ON "StrategyCampaign"("adAccountId");

-- AddForeignKey
ALTER TABLE "StrategyCampaign" ADD CONSTRAINT "StrategyCampaign_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyCampaign" ADD CONSTRAINT "StrategyCampaign_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
