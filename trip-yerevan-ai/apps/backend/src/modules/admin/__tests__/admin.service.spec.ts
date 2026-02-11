import { NotFoundException } from '@nestjs/common';
import { AdminService } from '../admin.service';
import { BookingStatus, MeetingProposalStatus, MeetingProposer } from '@prisma/client';
import { DomainException } from '../../../common/exceptions/domain.exception';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockPrisma() {
  return {
    booking: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
    },
  };
}

function createMockStateMachine() {
  return {
    transition: jest.fn().mockResolvedValue({
      success: true,
      booking: { id: 'b-1', status: BookingStatus.MEETING_SCHEDULED },
      notifications: [],
    }),
  };
}

function createMockMeetingService() {
  return {
    findActiveByBookingId: jest.fn(),
    confirm: jest.fn().mockResolvedValue({ success: true, meetingId: 'm-1' }),
    complete: jest.fn().mockResolvedValue({ success: true, meetingId: 'm-1' }),
    cancel: jest.fn().mockResolvedValue({ success: true, meetingId: 'm-1' }),
  };
}

function createMockProposalService() {
  return {
    getActiveProposal: jest.fn(),
    counterProposal: jest.fn().mockResolvedValue({
      success: true,
      proposalId: 'p-2',
      notifications: [],
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdminService', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;
  let meetingService: ReturnType<typeof createMockMeetingService>;
  let proposalService: ReturnType<typeof createMockProposalService>;

  beforeEach(() => {
    prisma = createMockPrisma();
    stateMachine = createMockStateMachine();
    meetingService = createMockMeetingService();
    proposalService = createMockProposalService();
    service = new AdminService(
      prisma as any,
      stateMachine as any,
      meetingService as any,
      proposalService as any,
      { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any,
    );
  });

  // -----------------------------------------------------------------------
  // findBookings
  // -----------------------------------------------------------------------

  describe('findBookings', () => {
    it('should return paginated bookings', async () => {
      const mockBookings = [
        {
          id: 'b-1',
          status: BookingStatus.AGENCY_CONFIRMED,
          totalPrice: 1500,
          currency: 'USD',
          createdAt: new Date(),
          user: { id: 'u-1', firstName: 'John', lastName: 'Doe' },
          agency: { id: 'a-1', name: 'TravelPro' },
          offer: {
            totalPrice: 1500,
            departureDate: new Date(),
            travelRequest: { destination: 'Dubai' },
          },
        },
      ];
      prisma.booking.findMany.mockResolvedValue(mockBookings);
      prisma.booking.count.mockResolvedValue(1);

      const result = await service.findBookings({
        page: 1,
        limit: 20,
        get skip() {
          return 0;
        },
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0].offer.destination).toBe('Dubai');
    });

    it('should apply status filter', async () => {
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);

      await service.findBookings({
        page: 1,
        limit: 20,
        status: BookingStatus.AGENCY_CONFIRMED,
        get skip() {
          return 0;
        },
      });

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: BookingStatus.AGENCY_CONFIRMED,
          }),
        }),
      );
    });

    it('should apply search filter', async () => {
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);

      await service.findBookings({
        page: 1,
        limit: 20,
        q: 'Dubai',
        get skip() {
          return 0;
        },
      });

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // findBookingById
  // -----------------------------------------------------------------------

  describe('findBookingById', () => {
    it('should return booking with full relations', async () => {
      const mockBooking = {
        id: 'b-1',
        status: BookingStatus.MEETING_SCHEDULED,
        user: { id: 'u-1', firstName: 'John' },
        meetings: [],
        meetingProposals: [],
        events: [],
      };
      prisma.booking.findUnique.mockResolvedValue(mockBooking);

      const result = await service.findBookingById('b-1');
      expect(result.id).toBe('b-1');
      expect(prisma.booking.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b-1' },
          include: expect.objectContaining({
            meetings: expect.any(Object),
            meetingProposals: expect.any(Object),
            events: expect.any(Object),
          }),
        }),
      );
    });

    it('should throw NotFoundException when not found', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      await expect(service.findBookingById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // verifyBooking
  // -----------------------------------------------------------------------

  describe('verifyBooking', () => {
    it('should confirm booking: MANAGER_VERIFIED then MEETING_SCHEDULED', async () => {
      const result = await service.verifyBooking(
        'b-1',
        { action: 'CONFIRM', notes: 'OK' },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(prisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b-1' },
          data: expect.objectContaining({ managerNotes: 'OK' }),
        }),
      );
      // Two transitions: MANAGER_VERIFIED and MEETING_SCHEDULED
      expect(stateMachine.transition).toHaveBeenCalledTimes(2);
      expect(stateMachine.transition).toHaveBeenNthCalledWith(
        1,
        'b-1',
        BookingStatus.MANAGER_VERIFIED,
        { triggeredBy: 'mgr-1' },
      );
      expect(stateMachine.transition).toHaveBeenNthCalledWith(
        2,
        'b-1',
        BookingStatus.MEETING_SCHEDULED,
        { triggeredBy: 'mgr-1' },
      );
    });

    it('should save checklist on confirm', async () => {
      const checklist = { priceOk: true, datesOk: true };

      await service.verifyBooking(
        'b-1',
        { action: 'CONFIRM', checklist },
        'mgr-1',
      );

      expect(prisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            verificationChecklist: checklist,
          }),
        }),
      );
    });

    it('should reject booking via CANCELLED transition', async () => {
      await service.verifyBooking(
        'b-1',
        { action: 'REJECT', notes: 'Price mismatch' },
        'mgr-1',
      );

      expect(stateMachine.transition).toHaveBeenCalledWith(
        'b-1',
        BookingStatus.CANCELLED,
        { triggeredBy: 'mgr-1', reason: 'Price mismatch' },
      );
    });

    it('should return error if state machine rejects verification', async () => {
      stateMachine.transition.mockResolvedValueOnce({
        success: false,
        error: 'Cannot transition from PAID to MANAGER_VERIFIED.',
        notifications: [],
      });

      const result = await service.verifyBooking(
        'b-1',
        { action: 'CONFIRM' },
        'mgr-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot transition');
    });
  });

  // -----------------------------------------------------------------------
  // confirmMeeting
  // -----------------------------------------------------------------------

  describe('confirmMeeting', () => {
    it('should confirm active meeting for booking', async () => {
      meetingService.findActiveByBookingId.mockResolvedValue({
        id: 'm-1',
        status: 'SCHEDULED',
      });

      const result = await service.confirmMeeting('b-1', 'mgr-1');

      expect(result.success).toBe(true);
      expect(meetingService.confirm).toHaveBeenCalledWith('m-1');
    });

    it('should throw when no active meeting found', async () => {
      meetingService.findActiveByBookingId.mockResolvedValue(null);

      await expect(service.confirmMeeting('b-1', 'mgr-1')).rejects.toThrow(
        DomainException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // completeMeeting
  // -----------------------------------------------------------------------

  describe('completeMeeting', () => {
    it('should complete meeting and transition to PAYMENT_PENDING', async () => {
      meetingService.findActiveByBookingId.mockResolvedValue({
        id: 'm-1',
        status: 'SCHEDULED',
      });

      const result = await service.completeMeeting(
        'b-1',
        { notes: 'Good meeting', amount: 1500, paymentMethod: 'CASH' },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(meetingService.complete).toHaveBeenCalledWith('m-1');
      expect(stateMachine.transition).toHaveBeenCalledWith(
        'b-1',
        BookingStatus.PAYMENT_PENDING,
        {
          triggeredBy: 'mgr-1',
          metadata: { notes: 'Good meeting', amount: 1500, paymentMethod: 'CASH' },
        },
      );
    });

    it('should default paymentMethod to CASH', async () => {
      meetingService.findActiveByBookingId.mockResolvedValue({ id: 'm-1' });

      await service.completeMeeting('b-1', {}, 'mgr-1');

      expect(stateMachine.transition).toHaveBeenCalledWith(
        'b-1',
        BookingStatus.PAYMENT_PENDING,
        expect.objectContaining({
          metadata: expect.objectContaining({ paymentMethod: 'CASH' }),
        }),
      );
    });

    it('should return error if meeting complete fails', async () => {
      meetingService.findActiveByBookingId.mockResolvedValue({ id: 'm-1' });
      meetingService.complete.mockResolvedValue({
        success: false,
        error: 'Already completed',
      });

      const result = await service.completeMeeting('b-1', {}, 'mgr-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Already completed');
    });

    it('should throw when no active meeting found', async () => {
      meetingService.findActiveByBookingId.mockResolvedValue(null);

      await expect(
        service.completeMeeting('b-1', {}, 'mgr-1'),
      ).rejects.toThrow(DomainException);
    });
  });

  // -----------------------------------------------------------------------
  // counterProposeMeeting
  // -----------------------------------------------------------------------

  describe('counterProposeMeeting', () => {
    it('should counter-propose when active proposal exists', async () => {
      proposalService.getActiveProposal.mockResolvedValue({
        id: 'p-1',
        status: MeetingProposalStatus.PENDING,
      });

      const result = await service.counterProposeMeeting(
        'b-1',
        { dateTime: '2026-03-15T14:00:00Z', location: 'Zoom', notes: 'Better' },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.proposalId).toBe('p-2');
      expect(proposalService.counterProposal).toHaveBeenCalledWith(
        'p-1',
        expect.objectContaining({
          bookingId: 'b-1',
          proposedBy: 'mgr-1',
          proposerRole: MeetingProposer.MANAGER,
          proposedDate: new Date('2026-03-15T14:00:00Z'),
          proposedLocation: 'Zoom',
          notes: 'Better',
        }),
      );
    });

    it('should throw when no active proposal exists', async () => {
      proposalService.getActiveProposal.mockResolvedValue(null);

      await expect(
        service.counterProposeMeeting(
          'b-1',
          { dateTime: '2026-03-15T14:00:00Z' },
          'mgr-1',
        ),
      ).rejects.toThrow(DomainException);
    });
  });

  // -----------------------------------------------------------------------
  // cancelMeeting
  // -----------------------------------------------------------------------

  describe('cancelMeeting', () => {
    it('should cancel active meeting', async () => {
      meetingService.findActiveByBookingId.mockResolvedValue({
        id: 'm-1',
        status: 'SCHEDULED',
      });

      const result = await service.cancelMeeting(
        'b-1',
        { reason: 'Reschedule' },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(meetingService.cancel).toHaveBeenCalledWith('m-1');
    });

    it('should throw when no active meeting found', async () => {
      meetingService.findActiveByBookingId.mockResolvedValue(null);

      await expect(
        service.cancelMeeting('b-1', {}, 'mgr-1'),
      ).rejects.toThrow(DomainException);
    });
  });

  // -----------------------------------------------------------------------
  // findMeetings
  // -----------------------------------------------------------------------

  describe('findMeetings', () => {
    it('should return bookings in meeting-related statuses', async () => {
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);

      await service.findMeetings({
        page: 1,
        limit: 20,
        get skip() {
          return 0;
        },
      });

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              in: [
                BookingStatus.MEETING_SCHEDULED,
                BookingStatus.PAYMENT_PENDING,
              ],
            },
          }),
        }),
      );
    });
  });
});
