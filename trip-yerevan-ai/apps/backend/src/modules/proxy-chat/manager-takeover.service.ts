import { Injectable, Logger } from '@nestjs/common';
import { ProxyChatService } from './proxy-chat.service';
import { ChatAuditLogService, ChatAuditEvent } from './chat-audit-log.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ProxyChatState, UserRole } from '@prisma/client';

export interface TakeoverNotification {
  chatId: number;
  text: string;
  buttons?: { label: string; callbackData: string }[];
}

export interface BookingCreatedResult {
  managerChannelNotification?: TakeoverNotification;
}

export interface ClaimResult {
  success: boolean;
  text: string;
  notifications: TakeoverNotification[];
}

@Injectable()
export class ManagerTakeoverService {
  private readonly logger = new Logger(ManagerTakeoverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly proxyChatService: ProxyChatService,
    private readonly chatAuditLog: ChatAuditLogService,
  ) {}

  /**
   * Called after a booking is created. Transitions OPEN proxy chats to BOOKED
   * and returns a notification for the manager channel with a "claim" button.
   */
  async onBookingCreated(
    travelRequestId: string,
    bookingId: string,
    managerChannelChatId?: number,
  ): Promise<BookingCreatedResult> {
    // Find all OPEN proxy chats for this TR and transition to BOOKED
    const chats = await this.proxyChatService.findByTravelRequest(travelRequestId);
    const openChats = chats.filter((c) => c.state === ProxyChatState.OPEN);

    for (const chat of openChats) {
      await this.proxyChatService.transitionState(chat.id, ProxyChatState.PAUSED);
      await this.chatAuditLog.log(
        chat.id,
        ChatAuditEvent.STATUS_CHANGED,
        undefined,
        { from: ProxyChatState.OPEN, to: ProxyChatState.PAUSED, bookingId },
      );
    }

    this.logger.log(
      `[manager-takeover] action=booking_created, trId=${travelRequestId}, bookingId=${bookingId}, chatsTransitioned=${openChats.length}`,
    );

    if (!managerChannelChatId) {
      return {};
    }

    // Build manager channel notification
    const tr = await this.prisma.travelRequest.findUnique({
      where: { id: travelRequestId },
      select: { destination: true },
    });

    return {
      managerChannelNotification: {
        chatId: managerChannelChatId,
        text:
          `*New Booking Created*\n\n` +
          `Destination: ${tr?.destination ?? 'N/A'}\n` +
          `Booking ID: \`${bookingId}\`\n\n` +
          `Click below to assign yourself as the manager.`,
        buttons: [
          {
            label: '\ud83d\ude4b Assign to me',
            callbackData: `mgr:claim:${travelRequestId}`,
          },
        ],
      },
    };
  }

  /**
   * Manager clicks "Assign to me" — claims the booking chat.
   */
  async claimChat(
    travelRequestId: string,
    managerUserId: string,
    managerTelegramId: bigint,
  ): Promise<ClaimResult> {
    // Verify the user is actually a MANAGER or ADMIN
    const user = await this.prisma.user.findUnique({
      where: { id: managerUserId },
      select: { role: true },
    });

    if (!user || (user.role !== UserRole.MANAGER && user.role !== UserRole.ADMIN)) {
      return {
        success: false,
        text: 'Only managers can claim bookings.',
        notifications: [],
      };
    }

    // Find BOOKED proxy chat for this TR
    const chats = await this.proxyChatService.findByTravelRequest(travelRequestId);
    const bookedChat = chats.find((c) => c.state === ProxyChatState.PAUSED);

    if (!bookedChat) {
      // Maybe already claimed or no chat exists
      const managedChat = chats.find(
        (c) => c.state === ProxyChatState.ESCALATED,
      );
      if (managedChat) {
        return {
          success: false,
          text: 'This booking has already been assigned to a manager.',
          notifications: [],
        };
      }
      return {
        success: false,
        text: 'No active chat found for this booking.',
        notifications: [],
      };
    }

    // Assign manager
    await this.proxyChatService.assignManager(bookedChat.id, managerUserId);
    await this.chatAuditLog.log(
      bookedChat.id,
      ChatAuditEvent.MANAGER_ASSIGNED,
      managerUserId,
      { travelRequestId },
    );

    this.logger.log(
      `[manager-takeover] action=claim, trId=${travelRequestId}, managerId=${managerUserId}, proxyChatId=${bookedChat.id}`,
    );

    // Load traveler and agency info for notifications
    const chatWithRelations = await this.prisma.proxyChat.findUnique({
      where: { id: bookedChat.id },
      include: {
        user: { select: { telegramId: true } },
        agency: {
          select: {
            name: true,
            memberships: {
              select: { user: { select: { telegramId: true } } },
              where: { status: 'ACTIVE' },
            },
          },
        },
      },
    });

    const notifications: TakeoverNotification[] = [];

    if (chatWithRelations) {
      // Notify traveler
      notifications.push({
        chatId: Number(chatWithRelations.user.telegramId),
        text:
          `A manager has been assigned to your booking.\n\n` +
          `For any questions, use the "Ask manager" button on the offer detail.`,
      });

      // Notify agency agents
      for (const membership of chatWithRelations.agency.memberships) {
        notifications.push({
          chatId: Number(membership.user.telegramId),
          text:
            `A manager has taken over the chat for a booking with *${chatWithRelations.agency.name}*.\n\n` +
            `The agency chat is now read-only.`,
        });
      }
    }

    return {
      success: true,
      text: 'You have been assigned as the manager for this booking.',
      notifications,
    };
  }
}
