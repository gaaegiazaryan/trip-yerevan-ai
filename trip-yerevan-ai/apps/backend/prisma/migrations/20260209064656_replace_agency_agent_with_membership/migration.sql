-- Step 1: Create new enum types
CREATE TYPE "AgencyRole" AS ENUM ('OWNER', 'AGENT', 'VIEWER');
CREATE TYPE "AgencyMembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- Step 2: Create new table
CREATE TABLE "agency_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agencyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "AgencyRole" NOT NULL,
    "status" "AgencyMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_memberships_pkey" PRIMARY KEY ("id")
);

-- Step 3: Migrate data from agency_agents (preserve IDs for Offer FK)
INSERT INTO "agency_memberships" ("id", "agencyId", "userId", "role", "status", "createdAt", "updatedAt")
SELECT
    "id",
    "agencyId",
    "userId",
    CASE
        WHEN "role" = 'OWNER' THEN 'OWNER'::"AgencyRole"
        ELSE 'AGENT'::"AgencyRole"
    END,
    CASE
        WHEN "status" = 'ACTIVE' THEN 'ACTIVE'::"AgencyMembershipStatus"
        ELSE 'DISABLED'::"AgencyMembershipStatus"
    END,
    "createdAt",
    "createdAt"
FROM "agency_agents";

-- Step 4: Add constraints and indexes
CREATE UNIQUE INDEX "agency_memberships_agencyId_userId_key" ON "agency_memberships"("agencyId", "userId");
CREATE INDEX "agency_memberships_userId_idx" ON "agency_memberships"("userId");

-- Step 5: Add foreign keys
ALTER TABLE "agency_memberships"
    ADD CONSTRAINT "agency_memberships_agencyId_fkey"
    FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agency_memberships"
    ADD CONSTRAINT "agency_memberships_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agency_memberships"
    ADD CONSTRAINT "agency_memberships_invitedByUserId_fkey"
    FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 6: Rename offers.agentId -> membershipId
ALTER TABLE "offers" DROP CONSTRAINT IF EXISTS "offers_agentId_fkey";
ALTER TABLE "offers" RENAME COLUMN "agentId" TO "membershipId";
ALTER TABLE "offers"
    ADD CONSTRAINT "offers_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "agency_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 7: Drop old table and enums
DROP TABLE "agency_agents";
DROP TYPE "AgentRole";
DROP TYPE "AgentStatus";
