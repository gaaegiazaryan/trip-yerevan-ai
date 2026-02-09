-- CreateEnum
CREATE TYPE "HotelStars" AS ENUM ('ONE', 'TWO', 'THREE', 'FOUR', 'FIVE');

-- CreateEnum
CREATE TYPE "MealPlan" AS ENUM ('RO', 'BB', 'HB', 'FB', 'AI', 'UAI');

-- CreateEnum
CREATE TYPE "FlightClass" AS ENUM ('ECONOMY', 'BUSINESS');

-- CreateEnum
CREATE TYPE "TransferType" AS ENUM ('GROUP', 'PRIVATE', 'VIP');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('HOTEL_IMAGE', 'ITINERARY_PDF', 'VOUCHER', 'OTHER');

-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "priceIncludes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "priceExcludes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "hotelName" TEXT,
ADD COLUMN     "hotelStars" "HotelStars",
ADD COLUMN     "roomType" TEXT,
ADD COLUMN     "mealPlan" "MealPlan",
ADD COLUMN     "hotelLocation" TEXT,
ADD COLUMN     "hotelDescription" TEXT,
ADD COLUMN     "airline" TEXT,
ADD COLUMN     "departureFlightNumber" TEXT,
ADD COLUMN     "returnFlightNumber" TEXT,
ADD COLUMN     "baggageIncluded" BOOLEAN,
ADD COLUMN     "flightClass" "FlightClass",
ADD COLUMN     "transferIncluded" BOOLEAN,
ADD COLUMN     "transferType" "TransferType",
ADD COLUMN     "departureDate" DATE,
ADD COLUMN     "returnDate" DATE,
ADD COLUMN     "nightsCount" INTEGER,
ADD COLUMN     "adults" INTEGER,
ADD COLUMN     "children" INTEGER,
ADD COLUMN     "insuranceIncluded" BOOLEAN;

-- CreateTable
CREATE TABLE "offer_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "offerId" UUID,
    "draftChatId" BIGINT,
    "type" "AttachmentType" NOT NULL,
    "telegramFileId" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offer_attachments_offerId_idx" ON "offer_attachments"("offerId");

-- CreateIndex
CREATE INDEX "offer_attachments_draftChatId_idx" ON "offer_attachments"("draftChatId");

-- AddForeignKey
ALTER TABLE "offer_attachments" ADD CONSTRAINT "offer_attachments_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
