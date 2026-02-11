import { BookingCallbackHandler } from '../booking-callback.handler';
import { UserRole, BookingStatus } from '@prisma/client';

function createMockPrisma() {
  return {
    booking: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ agencyId: 'agency-001' }),
    },
    agencyMembership: {
      findFirst: jest.fn().mockResolvedValue({ id: 'mem-001' }),
    },
  };
}

function createMockStateMachine() {
  return {
    transition: jest.fn().mockResolvedValue({
      success: true,
      notifications: [],
      booking: { id: 'booking-001' },
    }),
  };
}

describe('BookingCallbackHandler', () => {
  let handler: BookingCallbackHandler;
  let prisma: ReturnType<typeof createMockPrisma>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;

  beforeEach(() => {
    prisma = createMockPrisma();
    stateMachine = createMockStateMachine();
    handler = new BookingCallbackHandler(
      prisma as any,
      stateMachine as any,
    );
  });

  // -----------------------------------------------------------------------
  // Agency actions
  // -----------------------------------------------------------------------

  it('should allow agency member to confirm a booking', async () => {
    const result = await handler.handleCallback(
      'bk:confirm:booking-001',
      'user-agent-001',
      UserRole.TRAVELER,
    );

    expect(stateMachine.transition).toHaveBeenCalledWith(
      'booking-001',
      BookingStatus.AGENCY_CONFIRMED,
      { triggeredBy: 'user-agent-001' },
    );
    expect(result.text).toBe('Booking confirmed.');
  });

  it('should reject confirmation from non-agency-member', async () => {
    prisma.agencyMembership.findFirst.mockResolvedValue(null);

    const result = await handler.handleCallback(
      'bk:confirm:booking-001',
      'user-stranger',
      UserRole.TRAVELER,
    );

    expect(stateMachine.transition).not.toHaveBeenCalled();
    expect(result.text).toContain('not authorized');
    expect(result.notifications).toHaveLength(0);
  });

  it('should allow agency member to reject a booking', async () => {
    const result = await handler.handleCallback(
      'bk:reject:booking-001',
      'user-agent-001',
      UserRole.TRAVELER,
    );

    expect(stateMachine.transition).toHaveBeenCalledWith(
      'booking-001',
      BookingStatus.REJECTED_BY_AGENCY,
      { triggeredBy: 'user-agent-001' },
    );
    expect(result.text).toBe('Booking rejected.');
  });

  // -----------------------------------------------------------------------
  // Manager actions
  // -----------------------------------------------------------------------

  it('should allow manager to verify and auto-chain to PAYMENT_PENDING', async () => {
    stateMachine.transition
      .mockResolvedValueOnce({
        success: true,
        notifications: [{ chatId: 1, text: 'Verified' }],
        booking: { id: 'booking-001' },
      })
      .mockResolvedValueOnce({
        success: true,
        notifications: [{ chatId: 2, text: 'Payment pending' }],
        booking: { id: 'booking-001' },
      });

    const result = await handler.handleCallback(
      'bk:verify:booking-001',
      'user-manager',
      UserRole.MANAGER,
    );

    // First transition: MANAGER_VERIFIED
    expect(stateMachine.transition).toHaveBeenCalledWith(
      'booking-001',
      BookingStatus.MANAGER_VERIFIED,
      { triggeredBy: 'user-manager' },
    );

    // Second transition (auto-chain): PAYMENT_PENDING
    expect(stateMachine.transition).toHaveBeenCalledWith(
      'booking-001',
      BookingStatus.PAYMENT_PENDING,
      { triggeredBy: 'user-manager' },
    );

    expect(result.text).toContain('verified');
    expect(result.text).toContain('Payment instructions');
    // Notifications from both transitions are merged
    expect(result.notifications).toHaveLength(2);
  });

  it('should reject verification from non-manager', async () => {
    const result = await handler.handleCallback(
      'bk:verify:booking-001',
      'user-regular',
      UserRole.TRAVELER,
    );

    expect(stateMachine.transition).not.toHaveBeenCalled();
    expect(result.text).toContain('Only managers');
    expect(result.notifications).toHaveLength(0);
  });

  it('should allow manager to mark booking as paid', async () => {
    const result = await handler.handleCallback(
      'bk:paid:booking-001',
      'user-manager',
      UserRole.MANAGER,
    );

    expect(stateMachine.transition).toHaveBeenCalledWith(
      'booking-001',
      BookingStatus.PAID,
      { triggeredBy: 'user-manager' },
    );
    expect(result.text).toBe('Payment confirmed.');
  });

  it('should allow manager to cancel a booking', async () => {
    const result = await handler.handleCallback(
      'bk:cancel:booking-001',
      'user-manager',
      UserRole.MANAGER,
    );

    expect(stateMachine.transition).toHaveBeenCalledWith(
      'booking-001',
      BookingStatus.CANCELLED,
      { triggeredBy: 'user-manager', reason: 'Cancelled by manager' },
    );
    expect(result.text).toBe('Booking cancelled.');
  });

  it('should return error for unknown action', async () => {
    const result = await handler.handleCallback(
      'bk:unknown:booking-001',
      'user-manager',
      UserRole.MANAGER,
    );

    expect(stateMachine.transition).not.toHaveBeenCalled();
    expect(result.text).toBe('Unknown booking action.');
    expect(result.notifications).toHaveLength(0);
  });
});
