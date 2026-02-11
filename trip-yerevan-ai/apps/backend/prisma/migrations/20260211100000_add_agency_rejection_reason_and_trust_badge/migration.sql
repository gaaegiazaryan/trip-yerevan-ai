-- AlterTable: Add rejectionReason and trustBadge to agencies
ALTER TABLE "agencies" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "agencies" ADD COLUMN "trustBadge" BOOLEAN NOT NULL DEFAULT false;
