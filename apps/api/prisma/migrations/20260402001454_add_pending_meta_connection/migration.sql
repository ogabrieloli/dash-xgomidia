-- CreateTable
CREATE TABLE "PendingMetaConnection" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tempVaultPath" TEXT NOT NULL,
    "accounts" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingMetaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingMetaConnection_clientId_idx" ON "PendingMetaConnection"("clientId");
