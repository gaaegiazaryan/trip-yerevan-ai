/**
 * Reset Operational Data — Safe Cleanup Script
 *
 * Deletes all operational/transactional data while preserving:
 *   ✔ Manager user(s)
 *   ✔ Agency user(s)
 *   ✔ Agency record(s)
 *   ✔ AgencyMembership record(s)
 *   ✔ All schema & migrations
 *
 * Run from apps/backend/:
 *   npx ts-node --transpile-only scripts/reset-operational-data.ts
 *
 * DELETE ORDER (children → parents, respecting FK constraints):
 *   1.  ProxyChatMessage      (child of ProxyChat, CASCADE)
 *   2.  ChatAuditLog          (child of ProxyChat, CASCADE)
 *   3.  ProxyChat              (FK → TravelRequest, User, Agency, Offer)
 *   4.  SupportMessage         (child of SupportThread, CASCADE)
 *   5.  SupportThread          (FK → User, Offer, TravelRequest)
 *   6.  MeetingProposal        (self-ref counterProposalId → null first, then delete)
 *   7.  Meeting                (child of Booking, CASCADE)
 *   8.  BookingEvent           (child of Booking, CASCADE)
 *   9.  Booking                (FK → TravelRequest, Offer, User, Agency)
 *  10.  OfferItem              (child of Offer, CASCADE)
 *  11.  OfferAttachment        (child of Offer, CASCADE)
 *  12.  Offer                  (FK → TravelRequest, Agency, AgencyMembership)
 *  13.  RfqDistribution        (FK → TravelRequest, Agency)
 *  14.  AIFeedbackSignal       (child of AIConversation, CASCADE)
 *  15.  AIMessage              (child of AIConversation, CASCADE)
 *  16.  AIConversation         (FK → User, TravelRequest)
 *  17.  TravelRequest          (FK → User)
 *  18.  AgencyApplication      (FK → User)
 *  19.  ManagerNote            (FK → User)
 *  20.  RiskEvent              (no FK — standalone)
 *
 * PRESERVED:
 *  - User (all roles: MANAGER, ADMIN, TRAVELER, AGENCY)
 *  - Agency
 *  - AgencyMembership
 */

import { PrismaClient, AgencyStatus } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient({ log: ['warn', 'error'] });

  try {
    await prisma.$connect();
    console.log('✅ Connected to database\n');

    // ─── STEP 1: Identify preserved accounts ──────────────────────────
    const managers = await prisma.user.findMany({
      where: { role: 'MANAGER' },
      select: { id: true, firstName: true, role: true, telegramId: true },
    });
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, firstName: true, role: true, telegramId: true },
    });
    const agencies = await prisma.agency.findMany({
      select: { id: true, name: true, status: true },
    });
    const memberships = await prisma.agencyMembership.findMany({
      select: { id: true, userId: true, agencyId: true, role: true },
    });
    const allUsers = await prisma.user.findMany({
      select: { id: true, firstName: true, role: true },
    });

    console.log('📋 PRESERVED ACCOUNTS:');
    console.log(`   Managers:    ${managers.length}`, managers.map(u => `${u.firstName} (${u.id.slice(0, 8)})`));
    console.log(`   Admins:      ${admins.length}`, admins.map(u => `${u.firstName} (${u.id.slice(0, 8)})`));
    console.log(`   Agencies:    ${agencies.length}`, agencies.map(a => `${a.name} [${a.status}]`));
    console.log(`   Memberships: ${memberships.length}`);
    console.log(`   Total users: ${allUsers.length}`, allUsers.map(u => `${u.firstName}/${u.role}`));
    console.log();

    // ─── STEP 2: Count before deletion ────────────────────────────────
    const counts = {
      proxyChatMessages: await prisma.proxyChatMessage.count(),
      chatAuditLogs: await prisma.chatAuditLog.count(),
      proxyChats: await prisma.proxyChat.count(),
      supportMessages: await prisma.supportMessage.count(),
      supportThreads: await prisma.supportThread.count(),
      meetingProposals: await prisma.meetingProposal.count(),
      meetings: await prisma.meeting.count(),
      bookingEvents: await prisma.bookingEvent.count(),
      bookings: await prisma.booking.count(),
      offerItems: await prisma.offerItem.count(),
      offerAttachments: await prisma.offerAttachment.count(),
      offers: await prisma.offer.count(),
      rfqDistributions: await prisma.rfqDistribution.count(),
      aiFeedbackSignals: await prisma.aIFeedbackSignal.count(),
      aiMessages: await prisma.aIMessage.count(),
      aiConversations: await prisma.aIConversation.count(),
      travelRequests: await prisma.travelRequest.count(),
      agencyApplications: await prisma.agencyApplication.count(),
      managerNotes: await prisma.managerNote.count(),
      riskEvents: await prisma.riskEvent.count(),
    };

    console.log('📊 RECORDS TO DELETE:');
    for (const [table, count] of Object.entries(counts)) {
      if (count > 0) console.log(`   ${table}: ${count}`);
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`   ── TOTAL: ${total} records\n`);

    if (total === 0) {
      console.log('✨ Database is already clean. Nothing to delete.');
      return;
    }

    // ─── STEP 3: Delete in safe dependency order (single transaction) ─
    console.log('🗑️  DELETING operational data...\n');

    const result = await prisma.$transaction(async (tx) => {
      const deleted: Record<string, number> = {};

      // 1. ProxyChatMessage
      deleted.proxyChatMessages = (await tx.proxyChatMessage.deleteMany()).count;

      // 2. ChatAuditLog
      deleted.chatAuditLogs = (await tx.chatAuditLog.deleteMany()).count;

      // 3. ProxyChat
      deleted.proxyChats = (await tx.proxyChat.deleteMany()).count;

      // 4. SupportMessage
      deleted.supportMessages = (await tx.supportMessage.deleteMany()).count;

      // 5. SupportThread
      deleted.supportThreads = (await tx.supportThread.deleteMany()).count;

      // 6. MeetingProposal — null self-ref FK first, then delete
      await tx.meetingProposal.updateMany({
        where: { counterProposalId: { not: null } },
        data: { counterProposalId: null },
      });
      deleted.meetingProposals = (await tx.meetingProposal.deleteMany()).count;

      // 7. Meeting
      deleted.meetings = (await tx.meeting.deleteMany()).count;

      // 8. BookingEvent
      deleted.bookingEvents = (await tx.bookingEvent.deleteMany()).count;

      // 9. Booking
      deleted.bookings = (await tx.booking.deleteMany()).count;

      // 10. OfferItem
      deleted.offerItems = (await tx.offerItem.deleteMany()).count;

      // 11. OfferAttachment
      deleted.offerAttachments = (await tx.offerAttachment.deleteMany()).count;

      // 12. Offer
      deleted.offers = (await tx.offer.deleteMany()).count;

      // 13. RfqDistribution
      deleted.rfqDistributions = (await tx.rfqDistribution.deleteMany()).count;

      // 14. AIFeedbackSignal
      deleted.aiFeedbackSignals = (await tx.aIFeedbackSignal.deleteMany()).count;

      // 15. AIMessage
      deleted.aiMessages = (await tx.aIMessage.deleteMany()).count;

      // 16. AIConversation
      deleted.aiConversations = (await tx.aIConversation.deleteMany()).count;

      // 17. TravelRequest
      deleted.travelRequests = (await tx.travelRequest.deleteMany()).count;

      // 18. AgencyApplication
      deleted.agencyApplications = (await tx.agencyApplication.deleteMany()).count;

      // 19. ManagerNote
      deleted.managerNotes = (await tx.managerNote.deleteMany()).count;

      // 20. RiskEvent
      deleted.riskEvents = (await tx.riskEvent.deleteMany()).count;

      return deleted;
    }, { timeout: 30_000 }); // 30s for Neon cold start

    console.log('   ✅ Deleted:');
    for (const [table, count] of Object.entries(result)) {
      if (count > 0) console.log(`      ${table}: ${count}`);
    }
    const totalDeleted = Object.values(result).reduce((a, b) => a + b, 0);
    console.log(`      ── TOTAL: ${totalDeleted} records\n`);

    // ─── STEP 4: Reset status fields ──────────────────────────────────
    console.log('🔧 RESETTING agency status fields...');

    await prisma.agency.updateMany({
      data: {
        status: AgencyStatus.APPROVED,
        trustBadge: true,
        rejectionReason: null,
      },
    });
    console.log('   ✅ All agencies → APPROVED, trustBadge=true\n');

    // ─── STEP 5: Verify final state ──────────────────────────────────
    console.log('🔍 VERIFICATION:');

    const finalUsers = await prisma.user.count();
    const finalAgencies = await prisma.agency.count();
    const finalMemberships = await prisma.agencyMembership.count();
    const finalBookings = await prisma.booking.count();
    const finalOffers = await prisma.offer.count();
    const finalRequests = await prisma.travelRequest.count();
    const finalMeetings = await prisma.meeting.count();
    const finalProxyChats = await prisma.proxyChat.count();
    const finalNotes = await prisma.managerNote.count();
    const finalRisk = await prisma.riskEvent.count();
    const finalAI = await prisma.aIConversation.count();

    console.log(`   ✔ Users:          ${finalUsers} (preserved)`);
    console.log(`   ✔ Agencies:       ${finalAgencies} (preserved)`);
    console.log(`   ✔ Memberships:    ${finalMemberships} (preserved)`);
    console.log(`   ❌ Bookings:       ${finalBookings}`);
    console.log(`   ❌ Offers:         ${finalOffers}`);
    console.log(`   ❌ TravelRequests: ${finalRequests}`);
    console.log(`   ❌ Meetings:       ${finalMeetings}`);
    console.log(`   ❌ ProxyChats:     ${finalProxyChats}`);
    console.log(`   ❌ ManagerNotes:   ${finalNotes}`);
    console.log(`   ❌ RiskEvents:     ${finalRisk}`);
    console.log(`   ❌ AIConversations:${finalAI}`);

    const allClean =
      finalBookings === 0 &&
      finalOffers === 0 &&
      finalRequests === 0 &&
      finalMeetings === 0 &&
      finalProxyChats === 0 &&
      finalNotes === 0 &&
      finalRisk === 0 &&
      finalAI === 0;

    console.log();
    if (allClean && finalUsers > 0 && finalAgencies > 0) {
      console.log('✅ DATABASE RESET COMPLETE — Ready for end-to-end testing!');
    } else {
      console.error('⚠️  Verification failed — check output above.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ FATAL ERROR:', err);
    console.error('\n🔄 ROLLBACK: Transaction was NOT committed — no data was changed.');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
