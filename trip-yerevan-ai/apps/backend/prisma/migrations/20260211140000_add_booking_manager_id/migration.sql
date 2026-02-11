-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "managerId" UUID;

-- CreateIndex
CREATE INDEX "bookings_managerId_idx" ON "bookings"("managerId");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
