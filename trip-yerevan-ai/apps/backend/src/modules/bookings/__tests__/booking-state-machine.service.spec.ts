import { BookingStateMachineService } from '../booking-state-machine.service';
import { BookingStatus } from '@prisma/client';
import { BOOKING_EXPIRATION_JOB } from '../booking.constants';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockPrisma() {
  return {
    booking: { findUnique: jest.fn(), update: jest.fn() },
    bookingEvent: { create: jest.fn() },
    user: {
      findMany: jest.fn().mockResolvedValue([
        { telegramId: BigInt(55555) },
        { telegramId: BigInt(66666) },
      ]),
    },
    $transaction: jest.fn(),
  };
}

function createMockConfig() {
  return {
    get: jest.fn((key: string, defaultVal?: unknown) => {
      if (key === 'MANAGER_CHANNEL_CHAT_ID') return '77777';
      if (key === 'BOOKING_EXPIRATION_HOURS') return defaultVal ?? 24;
      return defaultVal;
    }),
  };
}

function createMockQueue() {
  return { add: jest.fn(), getJob: jest.fn().mockResolvedValue(null) };
}

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-001',
    status: BookingStatus.CREATED,
    totalPrice: 1500,
    currency: 'USD',
    user: { telegramId: BigInt(12345), firstName: 'John', lastName: 'Doe' },
    agency: {
      name: 'TestAgency',
      agencyTelegramChatId: null,
      memberships: [{ user: { telegramId: BigInt(88888) } }],
    },
    offer: {
      hotelName: 'Grand Hotel',
      departureDate: new Date('2026-03-15'),
      returnDate: new Date('2026-03-22'),
      nightsCount: 7,
      adults: 2,
      description: 'All-inclusive package',
      travelRequest: { destination: 'Dubai', adults: 2, children: 1 },
      membership: { user: { telegramId: BigInt(99999) } },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BookingStateMachineService', () => {
  let service: BookingStateMachineService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let config: ReturnType<typeof createMockConfig>;
  let queue: ReturnType<typeof createMockQueue>;

  beforeEach(() => {
    prisma = createMockPrisma();
    config = createMockConfig();
    queue = createMockQueue();

    // Default: $transaction executes callback with the same prisma mock
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));

    service = new BookingStateMachineService(
      prisma as any,
      config as any,
      queue as any,
    );
  });

  // -------------------------------------------------------------------------
  // 1. Valid transition succeeds
  // -------------------------------------------------------------------------
  it('should succeed for a valid CREATED -> AWAITING_AGENCY_CONFIRMATION transition', async () => {
    const booking = makeBooking();
    prisma.booking.findUnique.mockResolvedValue(booking);

    const updatedBooking = makeBooking({
      status: BookingStatus.AWAITING_AGENCY_CONFIRMATION,
    });
    prisma.booking.update.mockResolvedValue(updatedBooking);

    const result = await service.transition(
      'booking-001',
      BookingStatus.AWAITING_AGENCY_CONFIRMATION,
    );

    expect(result.success).toBe(true);
    expect(result.booking).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 2. Invalid transition returns error
  // -------------------------------------------------------------------------
  it('should return error for invalid CREATED -> PAID transition', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());

    const result = await service.transition(
      'booking-001',
      BookingStatus.PAID,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot transition from CREATED to PAID');
    expect(result.notifications).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 3. Terminal state rejects any transition
  // -------------------------------------------------------------------------
  it('should return error when transitioning from terminal state COMPLETED', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: BookingStatus.COMPLETED }),
    );

    const result = await service.transition(
      'booking-001',
      BookingStatus.CANCELLED,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot transition from COMPLETED to CANCELLED');
  });

  // -------------------------------------------------------------------------
  // 4. Booking not found returns error
  // -------------------------------------------------------------------------
  it('should return error when booking is not found', async () => {
    prisma.booking.findUnique.mockResolvedValue(null);

    const result = await service.transition(
      'non-existent',
      BookingStatus.AWAITING_AGENCY_CONFIRMATION,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Booking not found');
    expect(result.notifications).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 5. Correct timestamp set for AGENCY_CONFIRMED
  // -------------------------------------------------------------------------
  it('should set confirmedAt when transitioning to AGENCY_CONFIRMED', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: BookingStatus.AWAITING_AGENCY_CONFIRMATION }),
    );
    prisma.booking.update.mockResolvedValue(
      makeBooking({ status: BookingStatus.AGENCY_CONFIRMED }),
    );

    await service.transition(
      'booking-001',
      BookingStatus.AGENCY_CONFIRMED,
      { triggeredBy: 'agent-001' },
    );

    const updateCall = prisma.booking.update.mock.calls[0][0];
    expect(updateCall.data.confirmedAt).toBeInstanceOf(Date);
  });

  // -------------------------------------------------------------------------
  // 6. BookingEvent created with correct fromStatus/toStatus
  // -------------------------------------------------------------------------
  it('should create a bookingEvent with correct fromStatus and toStatus', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());
    prisma.booking.update.mockResolvedValue(
      makeBooking({ status: BookingStatus.AWAITING_AGENCY_CONFIRMATION }),
    );

    await service.transition(
      'booking-001',
      BookingStatus.AWAITING_AGENCY_CONFIRMATION,
    );

    expect(prisma.bookingEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: 'booking-001',
        fromStatus: BookingStatus.CREATED,
        toStatus: BookingStatus.AWAITING_AGENCY_CONFIRMATION,
      }),
    });
  });

  // -------------------------------------------------------------------------
  // 7. System event has null triggeredBy
  // -------------------------------------------------------------------------
  it('should set triggeredBy to null when no context triggeredBy is provided', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());
    prisma.booking.update.mockResolvedValue(
      makeBooking({ status: BookingStatus.AWAITING_AGENCY_CONFIRMATION }),
    );

    await service.transition(
      'booking-001',
      BookingStatus.AWAITING_AGENCY_CONFIRMATION,
    );

    expect(prisma.bookingEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        triggeredBy: null,
      }),
    });
  });

  // -------------------------------------------------------------------------
  // 8. User-triggered event has triggeredBy set
  // -------------------------------------------------------------------------
  it('should set triggeredBy when provided in context', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: BookingStatus.AWAITING_AGENCY_CONFIRMATION }),
    );
    prisma.booking.update.mockResolvedValue(
      makeBooking({ status: BookingStatus.AGENCY_CONFIRMED }),
    );

    await service.transition(
      'booking-001',
      BookingStatus.AGENCY_CONFIRMED,
      { triggeredBy: 'agent-001' },
    );

    expect(prisma.bookingEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        triggeredBy: 'agent-001',
      }),
    });
  });

  // -------------------------------------------------------------------------
  // 9. agencyConfirmedBy set when transitioning to AGENCY_CONFIRMED
  // -------------------------------------------------------------------------
  it('should set agencyConfirmedBy when transitioning to AGENCY_CONFIRMED', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: BookingStatus.AWAITING_AGENCY_CONFIRMATION }),
    );
    prisma.booking.update.mockResolvedValue(
      makeBooking({ status: BookingStatus.AGENCY_CONFIRMED }),
    );

    await service.transition(
      'booking-001',
      BookingStatus.AGENCY_CONFIRMED,
      { triggeredBy: 'agent-001' },
    );

    const updateCall = prisma.booking.update.mock.calls[0][0];
    expect(updateCall.data.agencyConfirmedBy).toBe('agent-001');
  });

  // -------------------------------------------------------------------------
  // 10. managerVerifiedBy set when transitioning to MANAGER_VERIFIED
  // -------------------------------------------------------------------------
  it('should set managerVerifiedBy when transitioning to MANAGER_VERIFIED', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: BookingStatus.AGENCY_CONFIRMED }),
    );
    prisma.booking.update.mockResolvedValue(
      makeBooking({ status: BookingStatus.MANAGER_VERIFIED }),
    );

    await service.transition(
      'booking-001',
      BookingStatus.MANAGER_VERIFIED,
      { triggeredBy: 'manager-001' },
    );

    const updateCall = prisma.booking.update.mock.calls[0][0];
    expect(updateCall.data.managerVerifiedBy).toBe('manager-001');
  });

  // -------------------------------------------------------------------------
  // 11. Expiration job scheduled on AWAITING_AGENCY_CONFIRMATION
  // -------------------------------------------------------------------------
  it('should schedule expiration job when transitioning to AWAITING_AGENCY_CONFIRMATION', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());
    prisma.booking.update.mockResolvedValue(
      makeBooking({ status: BookingStatus.AWAITING_AGENCY_CONFIRMATION }),
    );

    await service.transition(
      'booking-001',
      BookingStatus.AWAITING_AGENCY_CONFIRMATION,
    );

    expect(queue.add).toHaveBeenCalledWith(
      BOOKING_EXPIRATION_JOB,
      { bookingId: 'booking-001' },
      expect.objectContaining({
        delay: 24 * 60 * 60 * 1000,
        jobId: 'expire-booking-001',
      }),
    );
  });

  // -------------------------------------------------------------------------
  // 12. Expiration job cancelled on AGENCY_CONFIRMED (from AWAITING)
  // -------------------------------------------------------------------------
  it('should cancel expiration job when transitioning from AWAITING to AGENCY_CONFIRMED', async () => {
    const mockJob = { remove: jest.fn() };
    queue.getJob.mockResolvedValue(mockJob);

    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: BookingStatus.AWAITING_AGENCY_CONFIRMATION }),
    );
    prisma.booking.update.mockResolvedValue(
      makeBooking({ status: BookingStatus.AGENCY_CONFIRMED }),
    );

    await service.transition(
      'booking-001',
      BookingStatus.AGENCY_CONFIRMED,
      { triggeredBy: 'agent-001' },
    );

    expect(queue.getJob).toHaveBeenCalledWith('expire-booking-001');
    expect(mockJob.remove).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 13. Notifications built for AWAITING (agency gets confirm/reject buttons)
  // -------------------------------------------------------------------------
  it('should build notifications with confirm/reject buttons for AWAITING_AGENCY_CONFIRMATION', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());
    prisma.booking.update.mockResolvedValue(
      makeBooking({ status: BookingStatus.AWAITING_AGENCY_CONFIRMATION }),
    );

    const result = await service.transition(
      'booking-001',
      BookingStatus.AWAITING_AGENCY_CONFIRMATION,
    );

    expect(result.notifications.length).toBeGreaterThanOrEqual(1);

    const agentNotif = result.notifications.find(
      (n) => n.chatId === Number(BigInt(99999)),
    );
    expect(agentNotif).toBeDefined();
    expect(agentNotif!.text).toContain('New Booking Request');
    expect(agentNotif!.text).toContain('Dubai');
    expect(agentNotif!.buttons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: expect.stringContaining('Confirm'),
          callbackData: 'bk:confirm:booking-001',
        }),
        expect.objectContaining({
          label: expect.stringContaining('Reject'),
          callbackData: 'bk:reject:booking-001',
        }),
      ]),
    );
  });

  // -------------------------------------------------------------------------
  // 14. Notifications built for CANCELLED (traveler + agent + manager)
  // -------------------------------------------------------------------------
  it('should build notifications for traveler, agent, and all managers on CANCELLED', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: BookingStatus.PAID }),
    );
    prisma.booking.update.mockResolvedValue(
      makeBooking({ status: BookingStatus.CANCELLED }),
    );

    const result = await service.transition(
      'booking-001',
      BookingStatus.CANCELLED,
      { reason: 'Changed plans' },
    );

    expect(result.success).toBe(true);

    const chatIds = result.notifications.map((n) => n.chatId);
    // Traveler
    expect(chatIds).toContain(Number(BigInt(12345)));
    // Agent (offer.membership.user.telegramId)
    expect(chatIds).toContain(Number(BigInt(99999)));
    // Individual managers from DB
    expect(chatIds).toContain(55555);
    expect(chatIds).toContain(66666);
    // Manager channel as fallback
    expect(chatIds).toContain(77777);

    // All should mention cancellation
    for (const notif of result.notifications) {
      expect(notif.text).toContain('Cancelled');
    }

    // Verify managers were queried from DB
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: 'MANAGER', status: 'ACTIVE' },
      select: { telegramId: true },
    });
  });

  // -------------------------------------------------------------------------
  // 14b. AGENCY_CONFIRMED sends rich verification summary to manager channel
  // -------------------------------------------------------------------------
  it('should send rich verification summary to all managers on AGENCY_CONFIRMED', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: BookingStatus.AWAITING_AGENCY_CONFIRMATION }),
    );
    prisma.booking.update.mockResolvedValue(
      makeBooking({ status: BookingStatus.AGENCY_CONFIRMED }),
    );

    const result = await service.transition(
      'booking-001',
      BookingStatus.AGENCY_CONFIRMED,
      { triggeredBy: 'agent-001' },
    );

    expect(result.success).toBe(true);

    // Each individual manager should get rich summary with buttons
    const managerNotifs = result.notifications.filter(
      (n) => [55555, 66666, 77777].includes(n.chatId),
    );
    // 2 DB managers + 1 channel fallback = 3
    expect(managerNotifs.length).toBe(3);

    for (const managerNotif of managerNotifs) {
      expect(managerNotif.text).toContain('Booking Verification Required');
      expect(managerNotif.text).toContain('John Doe');
      expect(managerNotif.text).toContain('Dubai');
      expect(managerNotif.text).toContain('TestAgency');
      expect(managerNotif.text).toContain('Grand Hotel');
      expect(managerNotif.text).toContain('2 adults, 1 children');
      expect(managerNotif.buttons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ callbackData: 'bk:verify:booking-001' }),
          expect.objectContaining({ callbackData: 'bk:cancel:booking-001' }),
        ]),
      );
    }

    // Traveler should also be notified
    const travelerNotif = result.notifications.find(
      (n) => n.chatId === Number(BigInt(12345)),
    );
    expect(travelerNotif).toBeDefined();
    expect(travelerNotif!.text).toContain('Agency Confirmed');

    // Verify managers were queried from DB
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: 'MANAGER', status: 'ACTIVE' },
      select: { telegramId: true },
    });
  });

  // -------------------------------------------------------------------------
  // 14c. Falls back to channel when no managers in DB
  // -------------------------------------------------------------------------
  it('should fall back to channel when no managers exist in DB', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: BookingStatus.AWAITING_AGENCY_CONFIRMATION }),
    );
    prisma.booking.update.mockResolvedValue(
      makeBooking({ status: BookingStatus.AGENCY_CONFIRMED }),
    );

    const result = await service.transition(
      'booking-001',
      BookingStatus.AGENCY_CONFIRMED,
      { triggeredBy: 'agent-001' },
    );

    expect(result.success).toBe(true);

    // Should still notify channel as fallback
    const managerNotif = result.notifications.find(
      (n) => n.chatId === 77777,
    );
    expect(managerNotif).toBeDefined();
    expect(managerNotif!.text).toContain('Booking Verification Required');
  });

  // -------------------------------------------------------------------------
  // 14d. No duplicate notifications when manager chatId equals channel chatId
  // -------------------------------------------------------------------------
  it('should not send duplicate notification when manager telegramId matches channel', async () => {
    prisma.user.findMany.mockResolvedValue([
      { telegramId: BigInt(77777) }, // Same as MANAGER_CHANNEL_CHAT_ID
    ]);

    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: BookingStatus.AWAITING_AGENCY_CONFIRMATION }),
    );
    prisma.booking.update.mockResolvedValue(
      makeBooking({ status: BookingStatus.AGENCY_CONFIRMED }),
    );

    const result = await service.transition(
      'booking-001',
      BookingStatus.AGENCY_CONFIRMED,
      { triggeredBy: 'agent-001' },
    );

    // Exactly 1 manager notification (deduped), not 2
    const managerNotifs = result.notifications.filter(
      (n) => n.chatId === 77777,
    );
    expect(managerNotifs).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // 15. validateTransition() returns correct boolean
  // -------------------------------------------------------------------------
  describe('validateTransition', () => {
    it('should return true for valid transitions', () => {
      expect(
        service.validateTransition(
          BookingStatus.CREATED,
          BookingStatus.AWAITING_AGENCY_CONFIRMATION,
        ),
      ).toBe(true);

      expect(
        service.validateTransition(
          BookingStatus.AWAITING_AGENCY_CONFIRMATION,
          BookingStatus.AGENCY_CONFIRMED,
        ),
      ).toBe(true);

      expect(
        service.validateTransition(
          BookingStatus.PAID,
          BookingStatus.CANCELLED,
        ),
      ).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(
        service.validateTransition(
          BookingStatus.CREATED,
          BookingStatus.PAID,
        ),
      ).toBe(false);

      expect(
        service.validateTransition(
          BookingStatus.COMPLETED,
          BookingStatus.CANCELLED,
        ),
      ).toBe(false);

      expect(
        service.validateTransition(
          BookingStatus.EXPIRED,
          BookingStatus.CREATED,
        ),
      ).toBe(false);
    });
  });
});
