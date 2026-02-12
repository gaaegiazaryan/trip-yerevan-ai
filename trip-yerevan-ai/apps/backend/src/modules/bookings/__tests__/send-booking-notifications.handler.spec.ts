import { SendBookingNotificationsHandler } from '../events/send-booking-notifications.handler';
import { BookingCreatedEvent } from '../events/booking-created.event';
import { NotificationChannel } from '@prisma/client';

describe('SendBookingNotificationsHandler', () => {
  let handler: SendBookingNotificationsHandler;
  let eventBus: { register: jest.Mock };
  let notificationService: { sendAll: jest.Mock };
  let prisma: {
    offer: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let config: { get: jest.Mock };

  const basePayload = {
    bookingId: '11111111-2222-3333-4444-555555555555',
    offerId: 'offer-1',
    userId: 'user-1',
    agencyId: 'agency-1',
    travelRequestId: 'tr-1',
    totalPrice: 1500,
    currency: 'USD',
    destination: 'Yerevan',
    agencyName: 'Best Travel',
  };

  beforeEach(() => {
    eventBus = { register: jest.fn() };
    notificationService = {
      sendAll: jest.fn().mockResolvedValue([
        { notificationId: 'n1', deduplicated: false },
      ]),
    };
    prisma = {
      offer: {
        findUnique: jest.fn().mockResolvedValue({
          membership: { user: { id: 'agent-user-1', telegramId: '100' } },
          agency: { agencyTelegramChatId: '200' },
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ telegramId: '300' }),
      },
    };
    config = { get: jest.fn().mockReturnValue('999') };

    handler = new SendBookingNotificationsHandler(
      eventBus as any,
      notificationService as any,
      prisma as any,
      config as any,
    );
  });

  it('should have eventName "booking.created"', () => {
    expect(handler.eventName).toBe('booking.created');
  });

  it('should register with event bus on module init', () => {
    handler.onModuleInit();
    expect(eventBus.register).toHaveBeenCalledWith(handler);
  });

  it('should dispatch 4 notifications (agent, agency group, manager, traveler)', async () => {
    const event = new BookingCreatedEvent(basePayload);
    await handler.handle(event);

    expect(notificationService.sendAll).toHaveBeenCalledTimes(1);
    const requests = notificationService.sendAll.mock.calls[0][0];
    expect(requests).toHaveLength(4);

    expect(requests[0]).toMatchObject({
      recipientChatId: 100,
      templateKey: 'booking.created.agent',
      channel: NotificationChannel.TELEGRAM,
    });

    expect(requests[1]).toMatchObject({
      recipientChatId: 200,
      templateKey: 'booking.created.agent',
    });

    expect(requests[2]).toMatchObject({
      recipientChatId: 999,
      templateKey: 'booking.created.manager',
    });

    expect(requests[3]).toMatchObject({
      recipientChatId: 300,
      templateKey: 'booking.created.traveler',
    });
  });

  it('should deduplicate agent and agency group when same chatId', async () => {
    prisma.offer.findUnique.mockResolvedValue({
      membership: { user: { id: 'agent-user-1', telegramId: '100' } },
      agency: { agencyTelegramChatId: '100' },
    });

    const event = new BookingCreatedEvent(basePayload);
    await handler.handle(event);

    const requests = notificationService.sendAll.mock.calls[0][0];
    expect(requests).toHaveLength(3);
    expect(requests.map((r: any) => r.recipientChatId)).toEqual([100, 999, 300]);
  });

  it('should skip agency group when agencyTelegramChatId is null', async () => {
    prisma.offer.findUnique.mockResolvedValue({
      membership: { user: { id: 'agent-user-1', telegramId: '100' } },
      agency: { agencyTelegramChatId: null },
    });

    const event = new BookingCreatedEvent(basePayload);
    await handler.handle(event);

    const requests = notificationService.sendAll.mock.calls[0][0];
    expect(requests).toHaveLength(3);
  });

  it('should skip manager notification when MANAGER_CHANNEL_CHAT_ID not set', async () => {
    config.get.mockReturnValue(undefined);
    handler = new SendBookingNotificationsHandler(
      eventBus as any,
      notificationService as any,
      prisma as any,
      config as any,
    );

    const event = new BookingCreatedEvent(basePayload);
    await handler.handle(event);

    const requests = notificationService.sendAll.mock.calls[0][0];
    const managerReqs = requests.filter(
      (r: any) => r.templateKey === 'booking.created.manager',
    );
    expect(managerReqs).toHaveLength(0);
  });

  it('should skip agent notifications when offer not found', async () => {
    prisma.offer.findUnique.mockResolvedValue(null);

    const event = new BookingCreatedEvent(basePayload);
    await handler.handle(event);

    const requests = notificationService.sendAll.mock.calls[0][0];
    expect(requests).toHaveLength(2);
    expect(requests[0].templateKey).toBe('booking.created.manager');
    expect(requests[1].templateKey).toBe('booking.created.traveler');
  });

  it('should skip traveler notification when user has no telegramId', async () => {
    prisma.user.findUnique.mockResolvedValue({ telegramId: null });

    const event = new BookingCreatedEvent(basePayload);
    await handler.handle(event);

    const requests = notificationService.sendAll.mock.calls[0][0];
    const travelerReqs = requests.filter(
      (r: any) => r.templateKey === 'booking.created.traveler',
    );
    expect(travelerReqs).toHaveLength(0);
  });

  it('should populate variables correctly', async () => {
    const event = new BookingCreatedEvent(basePayload);
    await handler.handle(event);

    const requests = notificationService.sendAll.mock.calls[0][0];
    const vars = requests[0].variables;
    expect(vars.shortBookingId).toBe('11111111');
    expect(vars.agencyName).toBe('Best Travel');
    expect(vars.destination).toBe('Yerevan');
    expect(vars.currency).toBe('USD');
  });

  it('should use fallback destination when null', async () => {
    const event = new BookingCreatedEvent({
      ...basePayload,
      destination: null,
    });
    await handler.handle(event);

    const requests = notificationService.sendAll.mock.calls[0][0];
    expect(requests[0].variables.destination).toBe('Travel request');
  });

  it('should not call sendAll when no requests built', async () => {
    config.get.mockReturnValue(undefined);
    prisma.offer.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    handler = new SendBookingNotificationsHandler(
      eventBus as any,
      notificationService as any,
      prisma as any,
      config as any,
    );

    const event = new BookingCreatedEvent(basePayload);
    await handler.handle(event);

    expect(notificationService.sendAll).not.toHaveBeenCalled();
  });
});
