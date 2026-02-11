-- CreateEnum
CREATE TYPE "RiskSeverity" AS ENUM ('LOW', 'MED', 'HIGH');

-- CreateEnum
CREATE TYPE "RiskEntityType" AS ENUM ('USER', 'AGENCY', 'PROXY_CHAT', 'BOOKING');

-- CreateTable
CREATE TABLE "risk_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entityType" "RiskEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "severity" "RiskSeverity" NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "risk_events_entityType_entityId_idx" ON "risk_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "risk_events_severity_idx" ON "risk_events"("severity");

-- CreateIndex
CREATE INDEX "risk_events_createdAt_idx" ON "risk_events"("createdAt");
