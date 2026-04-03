-- AlterTable
ALTER TABLE "MetricSnapshot" ADD COLUMN     "pageEngagement" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "profileVisits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "InstagramSnapshot" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "igUserId" TEXT NOT NULL,
    "followersCount" INTEGER NOT NULL,
    "mediaCount" INTEGER NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAttributionSnapshot" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "externalCampaignId" TEXT,
    "followersGainedTotal" INTEGER NOT NULL,
    "profileVisits" INTEGER NOT NULL DEFAULT 0,
    "followersEstimated" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attributionWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAttributionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstagramSnapshot_clientId_collectedAt_idx" ON "InstagramSnapshot"("clientId", "collectedAt");

-- CreateIndex
CREATE INDEX "SocialAttributionSnapshot_adAccountId_date_idx" ON "SocialAttributionSnapshot"("adAccountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAttributionSnapshot_adAccountId_date_externalCampaign_key" ON "SocialAttributionSnapshot"("adAccountId", "date", "externalCampaignId");

-- AddForeignKey
ALTER TABLE "InstagramSnapshot" ADD CONSTRAINT "InstagramSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAttributionSnapshot" ADD CONSTRAINT "SocialAttributionSnapshot_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
