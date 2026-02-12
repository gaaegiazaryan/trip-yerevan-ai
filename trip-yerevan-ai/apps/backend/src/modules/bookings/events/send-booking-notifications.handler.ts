import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';
import { DomainEventHandler, EventBusService } from '../../../infra/events';
import {
  NotificationService,
  SendNotificationRequest,
} from '../../../infra/notifications';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { BookingCreatedEvent, BookingCreatedPayload } from './booking-created.event';

@Injectable()
export class SendBookingNotificationsHandler
  implements DomainEventHandler<BookingCreatedEvent>, OnModuleInit
{
  private readonly logger = new Logger(SendBookingNotificationsHandler.name);
  private readonly managerChannelChatId: number | null;

  readonly eventName = 'booking.created';

  constructor(
    private readonly eventBus: EventBusService,
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const raw = this.config.get<string>('MANAGER_CHANNEL_CHAT_ID');
    this.managerChannelChatId = raw ? Number(raw) : null;
  }

  onModuleInit() {
    this.eventBus.register(this);
  }

  async handle(event: BookingCreatedEvent): Promise<void> {
    const p = event.payload;

    const variables = this.buildVariables(p);
    const requests: SendNotificationRequest[] = [];

    // 1. Resolve agent chatId from the offer's membership
    const agentInfo = await this.resolveAgentInfo(p.offerId);
    if (agentInfo) {
      requests.push({
        eventName: event.eventName,
        recipientId: agentInfo.userId,
        recipientChatId: agentInfo.chatId,
        channel: NotificationChannel.TELEGRAM,
        templateKey: 'booking.created.agent',
        variables,
      });

      // 2. Agency group chat (deduplicate vs agent)
      if (agentInfo.agencyGroupChatId && agentInfo.agencyGroupChatId !== agentInfo.chatId) {
        requests.push({
          eventName: event.eventName,
          recipientId: p.agencyId,
          recipientChatId: agentInfo.agencyGroupChatId,
          channel: NotificationChannel.TELEGRAM,
          templateKey: 'booking.created.agent',
          variables,
        });
      }
    }

    // 3. Manager channel
    if (this.managerChannelChatId) {
      requests.push({
        eventName: event.eventName,
        recipientId: 'manager-channel',
        recipientChatId: this.managerChannelChatId,
        channel: NotificationChannel.TELEGRAM,
        templateKey: 'booking.created.manager',
        variables,
      });
    }

    // 4. Traveler notification
    const travelerChatId = await this.resolveTravelerChatId(p.userId);
    if (travelerChatId) {
      requests.push({
        eventName: event.eventName,
        recipientId: p.userId,
        recipientChatId: travelerChatId,
        channel: NotificationChannel.TELEGRAM,
        templateKey: 'booking.created.traveler',
        variables,
      });
    }

    if (requests.length > 0) {
      await this.notificationService.sendAll(requests);
    }

    this.logger.log(
      `[booking-notifications] Dispatched ${requests.length} notifications for bookingId=${p.bookingId}`,
    );
  }

  private buildVariables(
    p: BookingCreatedPayload,
  ): Record<string, string | number> {
    return {
      bookingId: p.bookingId,
      shortBookingId: p.bookingId.slice(0, 8),
      offerId: p.offerId,
      agencyName: p.agencyName,
      destination: p.destination ?? 'Travel request',
      price: Number(p.totalPrice).toLocaleString('en-US'),
      currency: p.currency,
    };
  }

  private async resolveAgentInfo(
    offerId: string,
  ): Promise<{
    userId: string;
    chatId: number;
    agencyGroupChatId: number | null;
  } | null> {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: {
        membership: { select: { user: { select: { id: true, telegramId: true } } } },
        agency: { select: { agencyTelegramChatId: true } },
      },
    });

    if (!offer?.membership?.user?.telegramId) return null;

    return {
      userId: offer.membership.user.id,
      chatId: Number(offer.membership.user.telegramId),
      agencyGroupChatId: offer.agency.agencyTelegramChatId
        ? Number(offer.agency.agencyTelegramChatId)
        : null,
    };
  }

  private async resolveTravelerChatId(
    userId: string,
  ): Promise<number | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    });
    return user?.telegramId ? Number(user.telegramId) : null;
  }
}
