import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  BookingStatus,
  OfferStatus,
  TravelRequestStatus,
} from '@prisma/client';
import {
  BookingStateMachineService,
  BookingNotification,
} from './booking-state-machine.service';
import { EventBusService } from '../../infra/events';
import { BookingCreatedEvent } from './events';

export interface AcceptConfirmationResult {
  text: string;
  buttons?: { label: string; callbackData: string }[];
}

export interface AcceptanceNotification {
  chatId: number;
  text: string;
  buttons?: { label: string; callbackData: string }[];
}

export interface AcceptanceResult {
  text: string;
  buttons?: { label: string; callbackData: string }[];
  notifications: AcceptanceNotification[];
  travelRequestId: string;
  bookingId?: string;
}

@Injectable()
export class BookingAcceptanceService {
  private readonly logger = new Logger(BookingAcceptanceService.name);
  private readonly managerChannelChatId: number | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly stateMachine: BookingStateMachineService,
    private readonly eventBus: EventBusService,
  ) {
    const raw = this.config.get<string>('MANAGER_CHANNEL_CHAT_ID');
    this.managerChannelChatId = raw ? Number(raw) : null;
  }

  getManagerChannelChatId(): number | null {
    return this.managerChannelChatId;
  }

  /**
   * Show a confirmation prompt before accepting the offer.
   */
  async showConfirmation(
    offerId: string,
    userId: string,
  ): Promise<AcceptConfirmationResult> {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        travelRequest: { select: { userId: true, status: true } },
        agency: { select: { name: true } },
      },
    });

    if (!offer) {
      return { text: 'Offer not found.' };
    }

    if (offer.travelRequest.userId !== userId) {
      return { text: 'You are not authorized to accept this offer.' };
    }

    if (offer.status === OfferStatus.ACCEPTED) {
      return { text: 'This offer has already been accepted.' };
    }

    if (
      offer.status === OfferStatus.WITHDRAWN ||
      offer.status === OfferStatus.EXPIRED
    ) {
      return { text: 'This offer is no longer available.' };
    }

    if (offer.travelRequest.status === TravelRequestStatus.BOOKED) {
      return {
        text: 'A booking already exists for this travel request.',
      };
    }

    const price = Number(offer.totalPrice).toLocaleString('en-US');

    return {
      text:
        `Are you sure you want to accept this offer?\n\n` +
        `*Agency:* ${offer.agency.name}\n` +
        `*Price:* ${price} ${offer.currency}\n\n` +
        `This will create a booking and notify the agency.`,
      buttons: [
        {
          label: '\u2705 Confirm',
          callbackData: `offers:cfm:${offerId}`,
        },
        { label: '\u274c Cancel', callbackData: 'offers:cxl' },
      ],
    };
  }

  /**
   * Confirm acceptance: create booking, transition statuses, withdraw others.
   * Returns notifications to send.
   */
  async confirmAcceptance(
    offerId: string,
    userId: string,
  ): Promise<AcceptanceResult> {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        travelRequest: {
          select: {
            id: true,
            userId: true,
            status: true,
            destination: true,
          },
        },
        agency: {
          select: { id: true, name: true, agencyTelegramChatId: true },
        },
        membership: {
          select: { user: { select: { telegramId: true } } },
        },
      },
    });

    if (!offer) {
      return {
        text: 'Offer not found.',
        notifications: [],
        travelRequestId: '',
      };
    }

    if (offer.travelRequest.userId !== userId) {
      return {
        text: 'You are not authorized to accept this offer.',
        notifications: [],
        travelRequestId: '',
      };
    }

    if (offer.travelRequest.status === TravelRequestStatus.BOOKED) {
      return {
        text: 'A booking already exists for this travel request.',
        notifications: [],
        travelRequestId: offer.travelRequestId,
      };
    }

    // Atomic transaction: create booking + update statuses
    let bookingId: string;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Create booking with CREATED status
        const booking = await tx.booking.create({
          data: {
            travelRequestId: offer.travelRequestId,
            offerId: offer.id,
            userId,
            agencyId: offer.agency.id,
            totalPrice: offer.totalPrice,
            currency: offer.currency,
            status: BookingStatus.CREATED,
            priceSnapshot: {
              totalPrice: Number(offer.totalPrice),
              currency: offer.currency,
              agencyName: offer.agency.name,
              destination: offer.travelRequest.destination,
            },
          },
        });

        // 2. Offer → ACCEPTED
        await tx.offer.update({
          where: { id: offerId },
          data: { status: OfferStatus.ACCEPTED },
        });

        // 3. TravelRequest → BOOKED
        await tx.travelRequest.update({
          where: { id: offer.travelRequestId },
          data: { status: TravelRequestStatus.BOOKED },
        });

        // 4. Withdraw other offers on the same TR
        await tx.offer.updateMany({
          where: {
            travelRequestId: offer.travelRequestId,
            id: { not: offerId },
            status: { in: [OfferStatus.SUBMITTED, OfferStatus.VIEWED] },
          },
          data: { status: OfferStatus.WITHDRAWN },
        });

        return booking;
      });

      bookingId = result.id;
    } catch (error: unknown) {
      // Unique constraint violation = double-accept race
      if (
        error instanceof Error &&
        'code' in error &&
        (error as any).code === 'P2002'
      ) {
        this.logger.warn(
          `[booking] action=double_accept, offerId=${offerId}, userId=${userId}`,
        );
        return {
          text: 'This offer has already been accepted.',
          notifications: [],
          travelRequestId: offer.travelRequestId,
        };
      }
      this.logger.error(
        `[booking] action=create_failed, offerId=${offerId}, userId=${userId}, error=${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }

    this.logger.log(
      `[booking] action=created, bookingId=${bookingId}, offerId=${offerId}, userId=${userId}, agencyId=${offer.agency.id}`,
    );

    // Publish domain event (fire-and-forget — handlers run async)
    this.eventBus
      .publish(
        new BookingCreatedEvent({
          bookingId,
          offerId: offer.id,
          userId,
          agencyId: offer.agency.id,
          travelRequestId: offer.travelRequestId,
          totalPrice: Number(offer.totalPrice),
          currency: offer.currency,
          destination: offer.travelRequest.destination,
          agencyName: offer.agency.name,
        }),
      )
      .catch((err) =>
        this.logger.error(
          `[booking] Event publish failed: ${err}`,
          err instanceof Error ? err.stack : undefined,
        ),
      );

    // Transition CREATED → AWAITING_AGENCY_CONFIRMATION via state machine.
    // Wrapped in try/catch: booking creation is the critical path — if the
    // state machine fails (e.g. Redis down, BullMQ unavailable) the user
    // should still be told the booking was created. The error is logged for
    // manual intervention.
    let smResult: { success: boolean; notifications: BookingNotification[] } = {
      success: false,
      notifications: [],
    };
    try {
      smResult = await this.stateMachine.transition(
        bookingId,
        BookingStatus.AWAITING_AGENCY_CONFIRMATION,
        { triggeredBy: userId },
      );
    } catch (smError) {
      this.logger.error(
        `[booking] CRITICAL: State machine transition failed after booking creation. ` +
          `bookingId=${bookingId}, offerId=${offerId}, userId=${userId}, error=${smError}`,
        smError instanceof Error ? smError.stack : undefined,
      );
    }

    // Build traveler confirmation notification
    const price = Number(offer.totalPrice).toLocaleString('en-US');
    const dest = offer.travelRequest.destination ?? 'Travel request';
    const shortBookingId = bookingId.slice(0, 8);

    // Build creation notifications (agent, agency group, manager channel)
    const notifications: AcceptanceNotification[] = [];

    const agentNotification =
      `\u2705 *Offer Accepted!*\n\n` +
      `*Destination:* ${dest}\n` +
      `*Price:* ${price} ${offer.currency}\n` +
      `*Booking ID:* ${shortBookingId}...\n\n` +
      `The traveler has accepted your offer. Please prepare the booking confirmation.`;

    // Agent personal chat
    const agentChatId = Number(offer.membership.user.telegramId);
    notifications.push({ chatId: agentChatId, text: agentNotification });

    // Agency group chat (deduplicate)
    if (
      offer.agency.agencyTelegramChatId &&
      Number(offer.agency.agencyTelegramChatId) !== agentChatId
    ) {
      notifications.push({
        chatId: Number(offer.agency.agencyTelegramChatId),
        text: agentNotification,
      });
    }

    // Manager channel
    if (this.managerChannelChatId) {
      const managerNotification =
        `\ud83d\udcdd *New Booking!*\n\n` +
        `*Destination:* ${dest}\n` +
        `*Agency:* ${offer.agency.name}\n` +
        `*Price:* ${price} ${offer.currency}\n` +
        `*Booking ID:* ${shortBookingId}...`;

      notifications.push({
        chatId: this.managerChannelChatId,
        text: managerNotification,
      });
    }

    // Merge state machine notifications (agency confirm/reject buttons)
    for (const n of smResult.notifications) {
      notifications.push(n);
    }

    return {
      text:
        `\u2705 *Booking Created!*\n\n` +
        `*Agency:* ${offer.agency.name}\n` +
        `*Destination:* ${dest}\n` +
        `*Price:* ${price} ${offer.currency}\n` +
        `*Booking ID:* ${shortBookingId}...\n\n` +
        `The agency has been notified and will confirm your booking shortly.`,
      notifications,
      travelRequestId: offer.travelRequestId,
      bookingId,
    };
  }
}
