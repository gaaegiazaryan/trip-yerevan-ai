-- AlterTable: add manager verification fields
ALTER TABLE "bookings" ADD COLUMN "managerNotes" TEXT;
ALTER TABLE "bookings" ADD COLUMN "verificationChecklist" JSONB;
