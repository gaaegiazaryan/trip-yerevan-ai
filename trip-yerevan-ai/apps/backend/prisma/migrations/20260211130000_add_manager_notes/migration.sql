-- CreateEnum
CREATE TYPE "NoteEntityType" AS ENUM ('TRAVELER', 'AGENCY', 'BOOKING', 'MEETING');

-- CreateTable
CREATE TABLE "manager_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "authorId" UUID NOT NULL,
    "entityType" "NoteEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manager_notes_entityType_entityId_idx" ON "manager_notes"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "manager_notes_authorId_idx" ON "manager_notes"("authorId");

-- AddForeignKey
ALTER TABLE "manager_notes" ADD CONSTRAINT "manager_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
