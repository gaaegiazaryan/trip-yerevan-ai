-- CreateEnum
CREATE TYPE "RfqDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'VIEWED', 'RESPONDED');

-- CreateTable
CREATE TABLE "rfq_distributions" (
    "id" UUID NOT NULL,
    "travelRequestId" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "deliveryStatus" "RfqDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "notificationPayload" JSONB,
    "distributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "rfq_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rfq_distributions_travelRequestId_idx" ON "rfq_distributions"("travelRequestId");

-- CreateIndex
CREATE INDEX "rfq_distributions_agencyId_idx" ON "rfq_distributions"("agencyId");

-- CreateIndex
CREATE INDEX "rfq_distributions_deliveryStatus_idx" ON "rfq_distributions"("deliveryStatus");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_distributions_travelRequestId_agencyId_key" ON "rfq_distributions"("travelRequestId", "agencyId");

-- AddForeignKey
ALTER TABLE "rfq_distributions" ADD CONSTRAINT "rfq_distributions_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_distributions" ADD CONSTRAINT "rfq_distributions_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
