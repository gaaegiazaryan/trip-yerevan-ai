import { MeetingCallbackHandler } from '../meeting-callback.handler';
import { UserRole, BookingStatus } from '@prisma/client';

function createMockPrisma() {
  return {
    meeting: {
      findUnique: jest.fn(),
    },
    booking: {
      findUnique: jest.fn(),
    },
  };
}

function createMockMeetingService() {
  return {
    schedule: jest.fn().mockResolvedValue({ success: true, meetingId: 'mtg-001' }),
    confirm: jest.fn().mockResolvedValue({ success: true, meetingId: 'mtg-001' }),
    complete: jest.fn().mockResolvedValue({ success: true, meetingId: 'mtg-001' }),
    cancel: jest.fn().mockResolvedValue({ success: true, meetingId: 'mtg-001' }),
    noShow: jest.fn().mockResolvedValue({ success: true, meetingId: 'mtg-001' }),
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

describe('MeetingCallbackHandler', () => {
  let handler: MeetingCallbackHandler;
  let prisma: ReturnType<typeof createMockPrisma>;
  let meetingService: ReturnType<typeof createMockMeetingService>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;

  beforeEach(() => {
    prisma = createMockPrisma();
    meetingService = createMockMeetingService();
    stateMachine = createMockStateMachine();
    handler = new MeetingCallbackHandler(
      prisma as any,
      meetingService as any,
      stateMachine as any,
    );
  });

  it('should reject non-manager users', async () => {
    const result = await handler.handleCallback(
      'mtg:schedule:booking-001',
      'user-regular',
      UserRole.TRAVELER,
    );

    expect(result.text).toContain('Only managers');
    expect(result.notifications).toHaveLength(0);
  });

  describe('schedule', () => {
    it('should schedule a meeting and notify traveler', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'booking-001',
        user: { telegramId: BigInt(12345), firstName: 'John' },
        offer: { travelRequest: { destination: 'Dubai' } },
      });

      const result = await handler.handleCallback(
        'mtg:schedule:booking-001',
        'user-manager',
        UserRole.MANAGER,
      );

      expect(meetingService.schedule).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: 'booking-001',
          scheduledBy: 'user-manager',
        }),
      );
      expect(result.text).toContain('Meeting scheduled');
      expect(result.notifications.length).toBeGreaterThanOrEqual(1);
      expect(result.notifications[0].chatId).toBe(12345);
      expect(result.notifications[0].text).toContain('Meeting Scheduled');
      expect(result.notifications[0].text).toContain('Dubai');
    });

    it('should return error when scheduling fails', async () => {
      meetingService.schedule.mockResolvedValue({
        success: false,
        error: 'Database error',
      });

      const result = await handler.handleCallback(
        'mtg:schedule:booking-001',
        'user-manager',
        UserRole.MANAGER,
      );

      expect(result.text).toBe('Database error');
      expect(result.notifications).toHaveLength(0);
    });
  });

  describe('confirm', () => {
    it('should confirm a meeting', async () => {
      const result = await handler.handleCallback(
        'mtg:confirm:mtg-001',
        'user-manager',
        UserRole.MANAGER,
      );

      expect(meetingService.confirm).toHaveBeenCalledWith('mtg-001');
      expect(result.text).toBe('Meeting confirmed.');
    });
  });

  describe('complete', () => {
    it('should complete meeting and transition booking to PAYMENT_PENDING', async () => {
      prisma.meeting.findUnique.mockResolvedValue({
        id: 'mtg-001',
        bookingId: 'booking-001',
      });

      const result = await handler.handleCallback(
        'mtg:complete:mtg-001',
        'user-manager',
        UserRole.MANAGER,
      );

      expect(meetingService.complete).toHaveBeenCalledWith('mtg-001');
      expect(stateMachine.transition).toHaveBeenCalledWith(
        'booking-001',
        BookingStatus.PAYMENT_PENDING,
        { triggeredBy: 'user-manager' },
      );
      expect(result.text).toContain('Meeting completed');
      expect(result.text).toContain('Payment instructions');
      expect(result.notifications).toHaveLength(1);
    });

    it('should return error when meeting not found', async () => {
      prisma.meeting.findUnique.mockResolvedValue(null);

      const result = await handler.handleCallback(
        'mtg:complete:non-existent',
        'user-manager',
        UserRole.MANAGER,
      );

      expect(result.text).toContain('not found');
      expect(stateMachine.transition).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('should cancel a meeting', async () => {
      const result = await handler.handleCallback(
        'mtg:cancel:mtg-001',
        'user-manager',
        UserRole.MANAGER,
      );

      expect(meetingService.cancel).toHaveBeenCalledWith('mtg-001');
      expect(result.text).toBe('Meeting cancelled.');
    });
  });

  describe('noshow', () => {
    it('should mark meeting as no-show', async () => {
      const result = await handler.handleCallback(
        'mtg:noshow:mtg-001',
        'user-manager',
        UserRole.MANAGER,
      );

      expect(meetingService.noShow).toHaveBeenCalledWith('mtg-001');
      expect(result.text).toBe('Meeting marked as no-show.');
    });
  });

  it('should return error for unknown action', async () => {
    const result = await handler.handleCallback(
      'mtg:unknown:mtg-001',
      'user-manager',
      UserRole.MANAGER,
    );

    expect(result.text).toBe('Unknown meeting action.');
    expect(result.notifications).toHaveLength(0);
  });
});
