-- CreateEnum
CREATE TYPE "StrategyObjective" AS ENUM ('LEAD', 'SALES', 'BRANDING');

-- AlterTable Strategy: add objective enum column
ALTER TABLE "Strategy" ADD COLUMN "objective" "StrategyObjective";

-- AlterTable MetricSnapshot: add 10 breakdown columns
ALTER TABLE "MetricSnapshot"
  ADD COLUMN "leads"                INT NOT NULL DEFAULT 0,
  ADD COLUMN "completeRegistration" INT NOT NULL DEFAULT 0,
  ADD COLUMN "landingPageViews"     INT NOT NULL DEFAULT 0,
  ADD COLUMN "linkClicks"           INT NOT NULL DEFAULT 0,
  ADD COLUMN "purchases"            INT NOT NULL DEFAULT 0,
  ADD COLUMN "addToCart"            INT NOT NULL DEFAULT 0,
  ADD COLUMN "initiateCheckout"     INT NOT NULL DEFAULT 0,
  ADD COLUMN "viewContent"          INT NOT NULL DEFAULT 0,
  ADD COLUMN "postEngagement"       INT NOT NULL DEFAULT 0,
  ADD COLUMN "videoViews3s"         INT NOT NULL DEFAULT 0;
