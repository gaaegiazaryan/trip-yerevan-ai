import { BookingExpirationProcessor } from '../booking-expiration.processor';
import { BookingStatus } from '@prisma/client';

function createMockPrisma() {
  return {
    booking: { findUnique: jest.fn() },
  };
}

function createMockStateMachine() {
  return {
    transition: jest.fn().mockResolvedValue({
      success: true,
      notifications: [],
    }),
  };
}

function createMockTelegramService() {
  return {
    sendMessage: jest.fn().mockResolvedValue(100),
    sendRfqToAgency: jest.fn().mockResolvedValue(101),
  };
}

describe('BookingExpirationProcessor', () => {
  let processor: BookingExpirationProcessor;
  let prisma: ReturnType<typeof createMockPrisma>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;
  let telegram: ReturnType<typeof createMockTelegramService>;

  beforeEach(() => {
    prisma = createMockPrisma();
    stateMachine = createMockStateMachine();
    telegram = createMockTelegramService();
    processor = new BookingExpirationProcessor(
      prisma as any,
      stateMachine as any,
      telegram as any,
    );
  });

  it('should expire a booking in AWAITING_AGENCY_CONFIRMATION status', async () => {
    prisma.booking.findUnique.mockResolvedValue({
      status: BookingStatus.AWAITING_AGENCY_CONFIRMATION,
    });

    await processor.process({
      data: { bookingId: 'booking-001' },
    } as any);

    expect(stateMachine.transition).toHaveBeenCalledWith(
      'booking-001',
      BookingStatus.EXPIRED,
      { reason: 'Agency did not confirm within the expiration window' },
    );
  });

  it('should skip if booking has already advanced (e.g., AGENCY_CONFIRMED)', async () => {
    prisma.booking.findUnique.mockResolvedValue({
      status: BookingStatus.AGENCY_CONFIRMED,
    });

    await processor.process({
      data: { bookingId: 'booking-001' },
    } as any);

    expect(stateMachine.transition).not.toHaveBeenCalled();
  });

  it('should skip if booking is not found', async () => {
    prisma.booking.findUnique.mockResolvedValue(null);

    await processor.process({
      data: { bookingId: 'booking-001' },
    } as any);

    expect(stateMachine.transition).not.toHaveBeenCalled();
  });

  it('should send notifications on successful expiration', async () => {
    prisma.booking.findUnique.mockResolvedValue({
      status: BookingStatus.AWAITING_AGENCY_CONFIRMATION,
    });

    stateMachine.transition.mockResolvedValue({
      success: true,
      notifications: [
        { chatId: 111, text: 'Your booking has expired.' },
        {
          chatId: 222,
          text: 'Booking expired',
          buttons: [{ label: 'View', callbackData: 'bk:view:booking-001' }],
        },
      ],
    });

    await processor.process({
      data: { bookingId: 'booking-001' },
    } as any);

    // Plain message notification
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      111,
      'Your booking has expired.',
    );

    // Notification with buttons
    expect(telegram.sendRfqToAgency).toHaveBeenCalledWith(
      222,
      'Booking expired',
      [{ label: 'View', callbackData: 'bk:view:booking-001' }],
    );
  });

  it('should handle notification failure gracefully without throwing', async () => {
    prisma.booking.findUnique.mockResolvedValue({
      status: BookingStatus.AWAITING_AGENCY_CONFIRMATION,
    });

    stateMachine.transition.mockResolvedValue({
      success: true,
      notifications: [
        { chatId: 111, text: 'Your booking has expired.' },
        { chatId: 333, text: 'Second notification.' },
      ],
    });

    // First notification fails, second succeeds
    telegram.sendMessage
      .mockRejectedValueOnce(new Error('Telegram API error'))
      .mockResolvedValueOnce(100);

    // Should not throw even though one notification fails
    await expect(
      processor.process({
        data: { bookingId: 'booking-001' },
      } as any),
    ).resolves.toBeUndefined();

    // Both notifications were attempted
    expect(telegram.sendMessage).toHaveBeenCalledTimes(2);
  });
});
