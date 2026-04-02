-- StrategyCampaign: cascade delete quando AdAccount ou Strategy forem deletadas
ALTER TABLE "StrategyCampaign" DROP CONSTRAINT IF EXISTS "StrategyCampaign_adAccountId_fkey";
ALTER TABLE "StrategyCampaign" DROP CONSTRAINT IF EXISTS "StrategyCampaign_strategyId_fkey";

ALTER TABLE "StrategyCampaign" ADD CONSTRAINT "StrategyCampaign_adAccountId_fkey"
    FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StrategyCampaign" ADD CONSTRAINT "StrategyCampaign_strategyId_fkey"
    FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MetricSnapshot: cascade delete quando AdAccount for deletada; set null quando Strategy for deletada
ALTER TABLE "MetricSnapshot" DROP CONSTRAINT IF EXISTS "MetricSnapshot_adAccountId_fkey";
ALTER TABLE "MetricSnapshot" DROP CONSTRAINT IF EXISTS "MetricSnapshot_strategyId_fkey";

ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_adAccountId_fkey"
    FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_strategyId_fkey"
    FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
