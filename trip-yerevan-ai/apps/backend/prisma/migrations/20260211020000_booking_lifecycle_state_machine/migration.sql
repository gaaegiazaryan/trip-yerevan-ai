-- ============================================================================
-- Migration: Booking Lifecycle State Machine
-- Replace BookingStatus enum, add lifecycle fields, evolve audit trail
-- ============================================================================

-- Step 1: Create new BookingStatus enum with temporary name
CREATE TYPE "BookingStatus_new" AS ENUM (
  'CREATED',
  'AWAITING_AGENCY_CONFIRMATION',
  'AGENCY_CONFIRMED',
  'MANAGER_VERIFIED',
  'PAYMENT_PENDING',
  'PAID',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'REJECTED_BY_AGENCY'
);

-- Step 2: Add new columns to bookings table
ALTER TABLE "bookings" ADD COLUMN "managerVerifiedAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "expiredAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "expireAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "agencyConfirmedBy" UUID;
ALTER TABLE "bookings" ADD COLUMN "managerVerifiedBy" UUID;
ALTER TABLE "bookings" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "bookings" ADD COLUMN "priceSnapshot" JSONB;
ALTER TABLE "bookings" ADD COLUMN "commissionSnapshot" JSONB;

-- Step 3: Add status_new column using the new enum
ALTER TABLE "bookings" ADD COLUMN "status_new" "BookingStatus_new" NOT NULL DEFAULT 'CREATED';

-- Step 4: Backfill status_new from old status
UPDATE "bookings" SET "status_new" = 'AWAITING_AGENCY_CONFIRMATION' WHERE "status" = 'PENDING_CONFIRMATION';
UPDATE "bookings" SET "status_new" = 'AGENCY_CONFIRMED' WHERE "status" = 'CONFIRMED';
UPDATE "bookings" SET "status_new" = 'PAID' WHERE "status" = 'PAID';
UPDATE "bookings" SET "status_new" = 'COMPLETED' WHERE "status" = 'COMPLETED';
UPDATE "bookings" SET "status_new" = 'CANCELLED' WHERE "status" = 'CANCELLED';
UPDATE "bookings" SET "status_new" = 'REJECTED_BY_AGENCY' WHERE "status" = 'REJECTED';

-- Step 5: Evolve booking_status_history → booking_events
ALTER TABLE "booking_status_history" RENAME TO "booking_events";

-- Add metadata column
ALTER TABLE "booking_events" ADD COLUMN "metadata" JSONB;

-- Rename changedBy → triggeredBy and make nullable
ALTER TABLE "booking_events" RENAME COLUMN "changedBy" TO "triggeredBy";
ALTER TABLE "booking_events" ALTER COLUMN "triggeredBy" DROP NOT NULL;

-- Drop FK constraint on triggeredBy (was changedBy → users.id)
ALTER TABLE "booking_events" DROP CONSTRAINT IF EXISTS "booking_status_history_changedBy_fkey";

-- Add new-enum status columns to booking_events
ALTER TABLE "booking_events" ADD COLUMN "fromStatus_new" "BookingStatus_new";
ALTER TABLE "booking_events" ADD COLUMN "toStatus_new" "BookingStatus_new";

-- Backfill booking_events fromStatus_new
UPDATE "booking_events" SET "fromStatus_new" = 'AWAITING_AGENCY_CONFIRMATION' WHERE "fromStatus" = 'PENDING_CONFIRMATION';
UPDATE "booking_events" SET "fromStatus_new" = 'AGENCY_CONFIRMED' WHERE "fromStatus" = 'CONFIRMED';
UPDATE "booking_events" SET "fromStatus_new" = 'PAID' WHERE "fromStatus" = 'PAID';
UPDATE "booking_events" SET "fromStatus_new" = 'COMPLETED' WHERE "fromStatus" = 'COMPLETED';
UPDATE "booking_events" SET "fromStatus_new" = 'CANCELLED' WHERE "fromStatus" = 'CANCELLED';
UPDATE "booking_events" SET "fromStatus_new" = 'REJECTED_BY_AGENCY' WHERE "fromStatus" = 'REJECTED';

-- Backfill booking_events toStatus_new
UPDATE "booking_events" SET "toStatus_new" = 'AWAITING_AGENCY_CONFIRMATION' WHERE "toStatus" = 'PENDING_CONFIRMATION';
UPDATE "booking_events" SET "toStatus_new" = 'AGENCY_CONFIRMED' WHERE "toStatus" = 'CONFIRMED';
UPDATE "booking_events" SET "toStatus_new" = 'PAID' WHERE "toStatus" = 'PAID';
UPDATE "booking_events" SET "toStatus_new" = 'COMPLETED' WHERE "toStatus" = 'COMPLETED';
UPDATE "booking_events" SET "toStatus_new" = 'CANCELLED' WHERE "toStatus" = 'CANCELLED';
UPDATE "booking_events" SET "toStatus_new" = 'REJECTED_BY_AGENCY' WHERE "toStatus" = 'REJECTED';

-- Step 6: Drop old enum columns and rename new ones

-- bookings.status
ALTER TABLE "bookings" DROP COLUMN "status";
ALTER TABLE "bookings" RENAME COLUMN "status_new" TO "status";

-- booking_events.fromStatus / toStatus
ALTER TABLE "booking_events" DROP COLUMN "fromStatus";
ALTER TABLE "booking_events" DROP COLUMN "toStatus";
ALTER TABLE "booking_events" RENAME COLUMN "fromStatus_new" TO "fromStatus";
ALTER TABLE "booking_events" RENAME COLUMN "toStatus_new" TO "toStatus";

-- Step 7: Drop old enum, rename new
DROP TYPE "BookingStatus";
ALTER TYPE "BookingStatus_new" RENAME TO "BookingStatus";

-- Step 8: Recreate indexes
CREATE INDEX "bookings_expireAt_idx" ON "bookings"("expireAt");

-- Rename the old index references (booking_status_history → booking_events)
-- The original indexes from init migration had names based on booking_status_history
-- They are preserved by the RENAME TABLE, so they still work on booking_events.
