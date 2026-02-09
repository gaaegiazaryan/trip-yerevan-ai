-- Step 1: Add applicantUserId as nullable
ALTER TABLE "agency_applications" ADD COLUMN "applicantUserId" UUID;

-- Step 2: Backfill from users table (join on telegramId)
UPDATE "agency_applications" aa
SET "applicantUserId" = u.id
FROM "users" u
WHERE u."telegramId" = aa."applicantTelegramId";

-- Step 3: Make applicantUserId NOT NULL (all existing rows should be backfilled)
ALTER TABLE "agency_applications" ALTER COLUMN "applicantUserId" SET NOT NULL;

-- Step 4: Drop old column and its index
DROP INDEX IF EXISTS "agency_applications_applicantTelegramId_idx";
ALTER TABLE "agency_applications" DROP COLUMN "applicantTelegramId";

-- Step 5: Add new index and foreign key
CREATE INDEX "agency_applications_applicantUserId_idx" ON "agency_applications"("applicantUserId");
ALTER TABLE "agency_applications" ADD CONSTRAINT "agency_applications_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
