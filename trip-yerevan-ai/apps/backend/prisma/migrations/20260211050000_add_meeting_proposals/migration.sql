-- CreateEnum: MeetingProposalStatus
CREATE TYPE "MeetingProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'COUNTER_PROPOSED', 'EXPIRED');

-- CreateEnum: MeetingProposer
CREATE TYPE "MeetingProposer" AS ENUM ('USER', 'MANAGER');

-- CreateTable: meeting_proposals
CREATE TABLE "meeting_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bookingId" UUID NOT NULL,
    "proposedBy" UUID NOT NULL,
    "proposerRole" "MeetingProposer" NOT NULL,
    "status" "MeetingProposalStatus" NOT NULL DEFAULT 'PENDING',
    "proposedDate" TIMESTAMP(3) NOT NULL,
    "proposedLocation" TEXT,
    "notes" TEXT,
    "counterProposalId" UUID,
    "respondedBy" UUID,
    "respondedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meeting_proposals_counterProposalId_key" ON "meeting_proposals"("counterProposalId");

-- CreateIndex
CREATE INDEX "meeting_proposals_bookingId_status_idx" ON "meeting_proposals"("bookingId", "status");

-- CreateIndex
CREATE INDEX "meeting_proposals_bookingId_createdAt_idx" ON "meeting_proposals"("bookingId", "createdAt");

-- AddForeignKey
ALTER TABLE "meeting_proposals" ADD CONSTRAINT "meeting_proposals_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (self-referential for proposal chain)
ALTER TABLE "meeting_proposals" ADD CONSTRAINT "meeting_proposals_counterProposalId_fkey" FOREIGN KEY ("counterProposalId") REFERENCES "meeting_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
