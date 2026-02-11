import { MeetingProposalService } from '../meeting-proposal.service';
import {
  BookingStatus,
  MeetingProposalStatus,
  MeetingProposer,
} from '@prisma/client';

function createMockPrisma() {
  return {
    booking: {
      findUnique: jest.fn(),
    },
    meetingProposal: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
  };
}

function createMockMeetingService() {
  return {
    schedule: jest
      .fn()
      .mockResolvedValue({ success: true, meetingId: 'mtg-001' }),
  };
}

function createMockStateMachine() {
  return {
    transition: jest.fn().mockResolvedValue({
      success: true,
      notifications: [{ chatId: 12345, text: 'Payment pending' }],
    }),
  };
}

describe('MeetingProposalService', () => {
  let service: MeetingProposalService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let meetingService: ReturnType<typeof createMockMeetingService>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;

  beforeEach(() => {
    prisma = createMockPrisma();
    meetingService = createMockMeetingService();
    stateMachine = createMockStateMachine();
    service = new MeetingProposalService(
      prisma as any,
      meetingService as any,
      stateMachine as any,
    );
  });

  describe('createProposal', () => {
    it('should create a proposal when booking is MEETING_SCHEDULED', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'booking-001',
        status: BookingStatus.MEETING_SCHEDULED,
      });

      const newProposal = { id: 'prop-001', bookingId: 'booking-001' };
      prisma.$transaction.mockImplementation(async (fn: any) => {
        // Simulate what the transaction does
        return newProposal;
      });

      const result = await service.createProposal({
        bookingId: 'booking-001',
        proposedBy: 'user-001',
        proposerRole: MeetingProposer.USER,
        proposedDate: new Date('2026-03-15T14:00:00Z'),
        proposedLocation: 'Our Office',
      });

      expect(result.success).toBe(true);
      expect(result.proposalId).toBe('prop-001');
    });

    it('should reject if booking is not MEETING_SCHEDULED', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'booking-001',
        status: BookingStatus.PAID,
      });

      const result = await service.createProposal({
        bookingId: 'booking-001',
        proposedBy: 'user-001',
        proposerRole: MeetingProposer.USER,
        proposedDate: new Date('2026-03-15T14:00:00Z'),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('PAID');
    });

    it('should reject if booking not found', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      const result = await service.createProposal({
        bookingId: 'nonexistent',
        proposedBy: 'user-001',
        proposerRole: MeetingProposer.USER,
        proposedDate: new Date(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('acceptProposal', () => {
    it('should accept proposal, create meeting, and transition booking', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        status: MeetingProposalStatus.PENDING,
        bookingId: 'booking-001',
        proposedDate: new Date('2026-03-15T14:00:00Z'),
        proposedLocation: 'Our Office',
        notes: 'Bring passport',
        proposerRole: MeetingProposer.USER,
        booking: {
          id: 'booking-001',
          status: BookingStatus.MEETING_SCHEDULED,
          user: { telegramId: BigInt(12345), firstName: 'John' },
        },
      });

      prisma.meetingProposal.update.mockResolvedValue({});

      const result = await service.acceptProposal('prop-001', 'manager-001');

      expect(result.success).toBe(true);
      expect(result.meetingId).toBe('mtg-001');
      expect(prisma.meetingProposal.update).toHaveBeenCalledWith({
        where: { id: 'prop-001' },
        data: expect.objectContaining({
          status: MeetingProposalStatus.ACCEPTED,
          respondedBy: 'manager-001',
        }),
      });
      expect(meetingService.schedule).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: 'booking-001',
          scheduledBy: 'manager-001',
          location: 'Our Office',
          notes: 'Bring passport',
        }),
      );
      expect(stateMachine.transition).toHaveBeenCalledWith(
        'booking-001',
        BookingStatus.PAYMENT_PENDING,
        { triggeredBy: 'manager-001' },
      );
      expect(result.notifications).toHaveLength(1);
    });

    it('should reject if proposal is not PENDING', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        status: MeetingProposalStatus.ACCEPTED,
        bookingId: 'booking-001',
        booking: { id: 'booking-001', status: BookingStatus.MEETING_SCHEDULED, user: {} },
      });

      const result = await service.acceptProposal('prop-001', 'manager-001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('ACCEPTED');
    });

    it('should return error if proposal not found', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue(null);

      const result = await service.acceptProposal('nonexistent', 'manager-001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('rejectProposal', () => {
    it('should reject proposal and notify proposer', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        status: MeetingProposalStatus.PENDING,
        bookingId: 'booking-001',
        proposerRole: MeetingProposer.USER,
        booking: {
          id: 'booking-001',
          user: { telegramId: BigInt(12345), firstName: 'John' },
        },
      });

      prisma.meetingProposal.update.mockResolvedValue({});

      const result = await service.rejectProposal(
        'prop-001',
        'manager-001',
        'Time conflict',
      );

      expect(result.success).toBe(true);
      expect(prisma.meetingProposal.update).toHaveBeenCalledWith({
        where: { id: 'prop-001' },
        data: expect.objectContaining({
          status: MeetingProposalStatus.REJECTED,
          rejectionReason: 'Time conflict',
        }),
      });
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].chatId).toBe(12345);
      expect(result.notifications[0].text).toContain('Rejected');
      expect(result.notifications[0].text).toContain('Time conflict');
    });

    it('should reject if proposal is not PENDING', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        status: MeetingProposalStatus.REJECTED,
        bookingId: 'booking-001',
        booking: { id: 'booking-001', user: {} },
      });

      const result = await service.rejectProposal('prop-001', 'manager-001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('REJECTED');
    });
  });

  describe('counterProposal', () => {
    it('should mark original as COUNTER_PROPOSED and create new proposal', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        status: MeetingProposalStatus.PENDING,
        bookingId: 'booking-001',
        proposerRole: MeetingProposer.USER,
      });

      const newProposal = { id: 'prop-002', bookingId: 'booking-001' };
      prisma.$transaction.mockImplementation(async (fn: any) => {
        return newProposal;
      });

      const result = await service.counterProposal('prop-001', {
        bookingId: 'booking-001',
        proposedBy: 'manager-001',
        proposerRole: MeetingProposer.MANAGER,
        proposedDate: new Date('2026-03-16T10:00:00Z'),
        proposedLocation: 'Zoom',
      });

      expect(result.success).toBe(true);
      expect(result.proposalId).toBe('prop-002');
    });

    it('should reject if original is not PENDING', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        status: MeetingProposalStatus.ACCEPTED,
      });

      const result = await service.counterProposal('prop-001', {
        bookingId: 'booking-001',
        proposedBy: 'manager-001',
        proposerRole: MeetingProposer.MANAGER,
        proposedDate: new Date(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('ACCEPTED');
    });

    it('should return error if original not found', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue(null);

      const result = await service.counterProposal('nonexistent', {
        bookingId: 'booking-001',
        proposedBy: 'manager-001',
        proposerRole: MeetingProposer.MANAGER,
        proposedDate: new Date(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('getActiveProposal', () => {
    it('should return the most recent PENDING proposal', async () => {
      const proposal = { id: 'prop-001', status: MeetingProposalStatus.PENDING };
      prisma.meetingProposal.findFirst.mockResolvedValue(proposal);

      const result = await service.getActiveProposal('booking-001');

      expect(result).toBe(proposal);
      expect(prisma.meetingProposal.findFirst).toHaveBeenCalledWith({
        where: {
          bookingId: 'booking-001',
          status: MeetingProposalStatus.PENDING,
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getProposalChain', () => {
    it('should return all proposals ordered by createdAt', async () => {
      const proposals = [
        { id: 'prop-001' },
        { id: 'prop-002' },
      ];
      prisma.meetingProposal.findMany.mockResolvedValue(proposals);

      const result = await service.getProposalChain('booking-001');

      expect(result).toEqual(proposals);
      expect(prisma.meetingProposal.findMany).toHaveBeenCalledWith({
        where: { bookingId: 'booking-001' },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('full lifecycle — multi-round negotiation', () => {
    it('should support USER propose → MANAGER counter → USER accept chain', async () => {
      // Step 1: USER creates proposal
      prisma.booking.findUnique.mockResolvedValue({
        id: 'booking-001',
        status: BookingStatus.MEETING_SCHEDULED,
      });

      const userProposal = { id: 'prop-001', bookingId: 'booking-001' };
      prisma.$transaction.mockImplementation(async () => userProposal);

      const createResult = await service.createProposal({
        bookingId: 'booking-001',
        proposedBy: 'user-001',
        proposerRole: MeetingProposer.USER,
        proposedDate: new Date('2026-03-15T14:00:00Z'),
        proposedLocation: 'Our Office',
      });
      expect(createResult.success).toBe(true);
      expect(createResult.proposalId).toBe('prop-001');

      // Step 2: MANAGER counter-proposes
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        status: MeetingProposalStatus.PENDING,
        bookingId: 'booking-001',
        proposerRole: MeetingProposer.USER,
      });

      const counterProposal = { id: 'prop-002', bookingId: 'booking-001' };
      prisma.$transaction.mockImplementation(async () => counterProposal);

      const counterResult = await service.counterProposal('prop-001', {
        bookingId: 'booking-001',
        proposedBy: 'manager-001',
        proposerRole: MeetingProposer.MANAGER,
        proposedDate: new Date('2026-03-16T10:00:00Z'),
        proposedLocation: 'Zoom',
      });
      expect(counterResult.success).toBe(true);
      expect(counterResult.proposalId).toBe('prop-002');

      // Step 3: USER accepts counter-proposal → meeting + booking transition
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-002',
        status: MeetingProposalStatus.PENDING,
        bookingId: 'booking-001',
        proposedDate: new Date('2026-03-16T10:00:00Z'),
        proposedLocation: 'Zoom',
        notes: null,
        proposerRole: MeetingProposer.MANAGER,
        booking: {
          id: 'booking-001',
          status: BookingStatus.MEETING_SCHEDULED,
          user: { telegramId: BigInt(12345), firstName: 'John' },
        },
      });
      prisma.meetingProposal.update.mockResolvedValue({});

      const acceptResult = await service.acceptProposal('prop-002', 'user-001');
      expect(acceptResult.success).toBe(true);
      expect(acceptResult.meetingId).toBe('mtg-001');
      expect(meetingService.schedule).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: 'booking-001',
          scheduledBy: 'user-001',
          location: 'Zoom',
        }),
      );
      expect(stateMachine.transition).toHaveBeenCalledWith(
        'booking-001',
        BookingStatus.PAYMENT_PENDING,
        { triggeredBy: 'user-001' },
      );
    });

    it('should support MANAGER propose → USER accept (direct accept)', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'booking-001',
        status: BookingStatus.MEETING_SCHEDULED,
      });

      const mgrProposal = { id: 'prop-mgr-001', bookingId: 'booking-001' };
      prisma.$transaction.mockImplementation(async () => mgrProposal);

      const createResult = await service.createProposal({
        bookingId: 'booking-001',
        proposedBy: 'manager-001',
        proposerRole: MeetingProposer.MANAGER,
        proposedDate: new Date('2026-03-20T11:00:00Z'),
        proposedLocation: 'Hotel Lobby',
      });
      expect(createResult.success).toBe(true);

      // USER directly accepts manager proposal
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-mgr-001',
        status: MeetingProposalStatus.PENDING,
        bookingId: 'booking-001',
        proposedDate: new Date('2026-03-20T11:00:00Z'),
        proposedLocation: 'Hotel Lobby',
        notes: null,
        proposerRole: MeetingProposer.MANAGER,
        booking: {
          id: 'booking-001',
          status: BookingStatus.MEETING_SCHEDULED,
          user: { telegramId: BigInt(12345), firstName: 'John' },
        },
      });
      prisma.meetingProposal.update.mockResolvedValue({});

      const acceptResult = await service.acceptProposal('prop-mgr-001', 'user-001');
      expect(acceptResult.success).toBe(true);
      expect(meetingService.schedule).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: 'booking-001',
          location: 'Hotel Lobby',
        }),
      );
    });
  });

  describe('invalid transition guards', () => {
    it('should reject accepting COUNTER_PROPOSED proposal', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        status: MeetingProposalStatus.COUNTER_PROPOSED,
        bookingId: 'booking-001',
        booking: { id: 'booking-001', status: BookingStatus.MEETING_SCHEDULED, user: {} },
      });

      const result = await service.acceptProposal('prop-001', 'manager-001');
      expect(result.success).toBe(false);
      expect(result.error).toContain('COUNTER_PROPOSED');
    });

    it('should reject accepting EXPIRED proposal', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        status: MeetingProposalStatus.EXPIRED,
        bookingId: 'booking-001',
        booking: { id: 'booking-001', status: BookingStatus.MEETING_SCHEDULED, user: {} },
      });

      const result = await service.acceptProposal('prop-001', 'manager-001');
      expect(result.success).toBe(false);
      expect(result.error).toContain('EXPIRED');
    });

    it('should reject rejecting COUNTER_PROPOSED proposal', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        status: MeetingProposalStatus.COUNTER_PROPOSED,
        bookingId: 'booking-001',
        booking: { id: 'booking-001', user: {} },
      });

      const result = await service.rejectProposal('prop-001', 'manager-001');
      expect(result.success).toBe(false);
      expect(result.error).toContain('COUNTER_PROPOSED');
    });

    it('should reject counter-proposing EXPIRED proposal', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        status: MeetingProposalStatus.EXPIRED,
      });

      const result = await service.counterProposal('prop-001', {
        bookingId: 'booking-001',
        proposedBy: 'manager-001',
        proposerRole: MeetingProposer.MANAGER,
        proposedDate: new Date(),
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('EXPIRED');
    });

    it('should reject counter-proposing REJECTED proposal', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        status: MeetingProposalStatus.REJECTED,
      });

      const result = await service.counterProposal('prop-001', {
        bookingId: 'booking-001',
        proposedBy: 'manager-001',
        proposerRole: MeetingProposer.MANAGER,
        proposedDate: new Date(),
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('REJECTED');
    });

    it('should reject creating proposal when booking is PAYMENT_PENDING', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'booking-001',
        status: BookingStatus.PAYMENT_PENDING,
      });

      const result = await service.createProposal({
        bookingId: 'booking-001',
        proposedBy: 'user-001',
        proposerRole: MeetingProposer.USER,
        proposedDate: new Date('2026-03-15T14:00:00Z'),
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('PAYMENT_PENDING');
    });

    it('should reject creating proposal when booking is CANCELLED', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'booking-001',
        status: BookingStatus.CANCELLED,
      });

      const result = await service.createProposal({
        bookingId: 'booking-001',
        proposedBy: 'user-001',
        proposerRole: MeetingProposer.USER,
        proposedDate: new Date(),
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('CANCELLED');
    });

    it('should handle meeting creation failure gracefully on accept', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        status: MeetingProposalStatus.PENDING,
        bookingId: 'booking-001',
        proposedDate: new Date('2026-03-15T14:00:00Z'),
        proposedLocation: 'Office',
        notes: null,
        proposerRole: MeetingProposer.USER,
        booking: {
          id: 'booking-001',
          status: BookingStatus.MEETING_SCHEDULED,
          user: { telegramId: BigInt(12345), firstName: 'John' },
        },
      });
      prisma.meetingProposal.update.mockResolvedValue({});
      meetingService.schedule.mockResolvedValue({
        success: false,
        error: 'Time conflict with another meeting.',
      });

      const result = await service.acceptProposal('prop-001', 'manager-001');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Time conflict');
      expect(stateMachine.transition).not.toHaveBeenCalled();
    });
  });

  describe('proposal rejection notifications', () => {
    it('should not notify traveler when traveler rejects MANAGER proposal', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        status: MeetingProposalStatus.PENDING,
        bookingId: 'booking-001',
        proposerRole: MeetingProposer.MANAGER,
        booking: {
          id: 'booking-001',
          user: { telegramId: BigInt(12345), firstName: 'John' },
        },
      });
      prisma.meetingProposal.update.mockResolvedValue({});

      const result = await service.rejectProposal('prop-001', 'user-001', 'Too late in the day');
      expect(result.success).toBe(true);
      // Manager rejection of own proposal → no outbound notification
      // (manager gets inline response in Telegram)
      expect(result.notifications).toHaveLength(0);
    });

    it('should send "Propose New Time" button when USER proposal rejected', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        status: MeetingProposalStatus.PENDING,
        bookingId: 'booking-001',
        proposerRole: MeetingProposer.USER,
        booking: {
          id: 'booking-001',
          user: { telegramId: BigInt(12345), firstName: 'John' },
        },
      });
      prisma.meetingProposal.update.mockResolvedValue({});

      const result = await service.rejectProposal('prop-001', 'manager-001', 'Not available');
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].buttons).toBeDefined();
      expect(result.notifications[0].buttons![0].callbackData).toBe(
        'mpw:start:booking-001',
      );
    });
  });

  describe('buildProposalNotifications', () => {
    it('should notify managers when USER proposes', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        bookingId: 'booking-001',
        booking: {
          id: 'booking-001',
          userId: 'user-001',
          user: { telegramId: BigInt(12345), firstName: 'John' },
          offer: {
            travelRequest: { destination: 'Dubai' },
          },
        },
      });
      prisma.user.findMany.mockResolvedValue([
        { telegramId: BigInt(55555) },
        { telegramId: BigInt(66666) },
      ]);

      const notifications = await service.buildProposalNotifications(
        'prop-001',
        MeetingProposer.USER,
        new Date('2026-03-15T14:00:00Z'),
        'Our Office',
      );

      expect(notifications).toHaveLength(2);
      expect(notifications[0].chatId).toBe(55555);
      expect(notifications[0].text).toContain('Meeting Proposal');
      expect(notifications[0].text).toContain('Dubai');
      expect(notifications[0].buttons).toHaveLength(3);
    });

    it('should notify traveler when MANAGER proposes', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        id: 'prop-001',
        bookingId: 'booking-001',
        booking: {
          id: 'booking-001',
          userId: 'user-001',
          user: { telegramId: BigInt(12345), firstName: 'John' },
          offer: {
            travelRequest: { destination: 'Paris' },
          },
        },
      });

      const notifications = await service.buildProposalNotifications(
        'prop-001',
        MeetingProposer.MANAGER,
        new Date('2026-03-15T10:00:00Z'),
      );

      expect(notifications).toHaveLength(1);
      expect(notifications[0].chatId).toBe(12345);
      expect(notifications[0].text).toContain('Meeting Proposal');
      expect(notifications[0].text).toContain('Paris');
    });
  });
});
