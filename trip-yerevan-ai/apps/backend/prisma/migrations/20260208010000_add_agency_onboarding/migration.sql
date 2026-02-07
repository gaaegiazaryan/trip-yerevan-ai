-- ============================================================================
-- Migration: add_agency_onboarding
-- - AgencyStatus: remove VERIFIED, add APPROVED + REJECTED (data: VERIFIED→APPROVED)
-- - UserRole: add MANAGER
-- - Agency: contactEmail nullable, add verifiedAt/verifiedByUserId
-- - New model: AgencyApplication
-- ============================================================================

-- 1. Recreate AgencyStatus enum: VERIFIED → APPROVED, add REJECTED
ALTER TYPE "AgencyStatus" RENAME TO "AgencyStatus_old";
CREATE TYPE "AgencyStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'BLOCKED');

ALTER TABLE "agencies" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "agencies" ALTER COLUMN "status" TYPE "AgencyStatus" USING (
  CASE WHEN "status"::text = 'VERIFIED' THEN 'APPROVED' ELSE "status"::text END
)::"AgencyStatus";
ALTER TABLE "agencies" ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP TYPE "AgencyStatus_old";

-- 2. Add MANAGER to UserRole
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MANAGER';

-- 3. Create AgencyApplicationStatus enum
CREATE TYPE "AgencyApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- 4. Alter agencies table: make contactEmail nullable, add verification fields
ALTER TABLE "agencies" ALTER COLUMN "contactEmail" DROP NOT NULL;
ALTER TABLE "agencies" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "agencies" ADD COLUMN "verifiedByUserId" UUID;

-- 5. Create agency_applications table
CREATE TABLE "agency_applications" (
    "id" UUID NOT NULL,
    "applicantTelegramId" BIGINT NOT NULL,
    "draftData" JSONB NOT NULL,
    "status" "AgencyApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewerUserId" UUID,
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "agency_applications_pkey" PRIMARY KEY ("id")
);

-- 6. Create indexes
CREATE INDEX "agency_applications_applicantTelegramId_idx" ON "agency_applications"("applicantTelegramId");
CREATE INDEX "agency_applications_status_idx" ON "agency_applications"("status");

-- 7. Add foreign keys
ALTER TABLE "agency_applications" ADD CONSTRAINT "agency_applications_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
