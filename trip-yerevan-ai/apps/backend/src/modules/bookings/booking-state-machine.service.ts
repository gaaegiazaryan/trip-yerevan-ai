import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BookingStatus, Prisma, UserRole, UserStatus } from '@prisma/client';
import {
  VALID_BOOKING_TRANSITIONS,
  STATUS_TIMESTAMP_MAP,
  BOOKING_QUEUE,
  BOOKING_EXPIRATION_JOB,
} from './booking.constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BookingNotification {
  chatId: number;
  text: string;
  buttons?: { label: string; callbackData: string }[];
}

export interface TransitionResult {
  success: boolean;
  booking?: BookingWithRelations;
  error?: string;
  notifications: BookingNotification[];
}

export interface TransitionContext {
  triggeredBy?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/** Shape returned by the booking query with relations needed for notifications */
type BookingWithRelations = Prisma.BookingGetPayload<{
  include: {
    user: { select: { telegramId: true; firstName: true; lastName: true } };
    agency: {
      select: {
        name: true;
        agencyTelegramChatId: true;
        memberships: {
          select: { user: { select: { telegramId: true } } };
        };
      };
    };
    offer: {
      select: {
        hotelName: true;
        departureDate: true;
        returnDate: true;
        nightsCount: true;
        adults: true;
        description: true;
        travelRequest: {
          select: { destination: true; adults: true; children: true };
        };
        membership: { select: { user: { select: { telegramId: true } } } };
      };
    };
  };
}>;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class BookingStateMachineService {
  private readonly logger = new Logger(BookingStateMachineService.name);
  private readonly managerChannelChatId: number | null;
  private readonly expirationHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(BOOKING_QUEUE) private readonly bookingQueue: Queue,
  ) {
    const raw = this.config.get<string>('MANAGER_CHANNEL_CHAT_ID');
    this.managerChannelChatId = raw ? Number(raw) : null;
    this.expirationHours = this.config.get<number>(
      'BOOKING_EXPIRATION_HOURS',
      24,
    );
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  async transition(
    bookingId: string,
    toStatus: BookingStatus,
    ctx: TransitionContext = {},
  ): Promise<TransitionResult> {
    const booking = await this.loadBooking(bookingId);

    if (!booking) {
      return { success: false, error: 'Booking not found.', notifications: [] };
    }

    const fromStatus = booking.status;

    if (!this.validateTransition(fromStatus, toStatus)) {
      this.logger.warn(
        `[booking-sm] Invalid transition: ${fromStatus} → ${toStatus}, bookingId=${bookingId}`,
      );
      return {
        success: false,
        error: `Cannot transition from ${fromStatus} to ${toStatus}.`,
        notifications: [],
      };
    }

    // Atomic: update status + create audit event (minimal writes only).
    // Deep relation loading is done OUTSIDE the transaction to avoid
    // Neon serverless cold-start timeouts (default 5 s).
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: toStatus,
          ...this.buildTimestampUpdate(toStatus),
          ...this.buildActorUpdate(toStatus, ctx.triggeredBy),
          ...(toStatus === BookingStatus.CANCELLED && ctx.reason
            ? { cancelReason: ctx.reason }
            : {}),
        },
      });

      await tx.bookingEvent.create({
        data: {
          bookingId,
          fromStatus,
          toStatus,
          triggeredBy: ctx.triggeredBy ?? null,
          reason: ctx.reason,
          metadata: ctx.metadata
            ? (ctx.metadata as Prisma.InputJsonValue)
            : undefined,
        },
      });
    });

    // Load full relations for notification building (outside transaction)
    const updated = await this.loadBooking(bookingId);
    if (!updated) {
      // Should never happen — booking was just updated
      this.logger.error(
        `[booking-sm] Booking disappeared after transition, bookingId=${bookingId}`,
      );
      return { success: true, notifications: [] };
    }

    this.logger.log(
      `[booking-sm] transition=${fromStatus}→${toStatus}, bookingId=${bookingId}, triggeredBy=${ctx.triggeredBy ?? 'SYSTEM'}`,
    );

    // Post-transaction side effects
    if (toStatus === BookingStatus.AWAITING_AGENCY_CONFIRMATION) {
      await this.scheduleExpiration(bookingId);
    }
    if (
      fromStatus === BookingStatus.AWAITING_AGENCY_CONFIRMATION &&
      toStatus !== BookingStatus.EXPIRED
    ) {
      await this.cancelExpiration(bookingId);
    }

    const notifications = await this.buildNotifications(
      updated,
      fromStatus,
      toStatus,
    );

    return { success: true, booking: updated, notifications };
  }

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  validateTransition(from: BookingStatus, to: BookingStatus): boolean {
    return VALID_BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async loadBooking(
    bookingId: string,
  ): Promise<BookingWithRelations | null> {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: { select: { telegramId: true, firstName: true, lastName: true } },
        agency: {
          select: {
            name: true,
            agencyTelegramChatId: true,
            memberships: {
              where: { status: 'ACTIVE' },
              select: { user: { select: { telegramId: true } } },
            },
          },
        },
        offer: {
          select: {
            hotelName: true,
            departureDate: true,
            returnDate: true,
            nightsCount: true,
            adults: true,
            description: true,
            travelRequest: {
              select: { destination: true, adults: true, children: true },
            },
            membership: {
              select: { user: { select: { telegramId: true } } },
            },
          },
        },
      },
    });
  }

  private buildTimestampUpdate(
    toStatus: BookingStatus,
  ): Record<string, Date> {
    const field = STATUS_TIMESTAMP_MAP[toStatus];
    return field ? { [field]: new Date() } : {};
  }

  private buildActorUpdate(
    toStatus: BookingStatus,
    triggeredBy?: string,
  ): Record<string, string> {
    if (!triggeredBy) return {};
    if (toStatus === BookingStatus.AGENCY_CONFIRMED) {
      return { agencyConfirmedBy: triggeredBy };
    }
    if (toStatus === BookingStatus.MANAGER_VERIFIED) {
      return { managerVerifiedBy: triggeredBy };
    }
    return {};
  }

  private async scheduleExpiration(bookingId: string): Promise<void> {
    const delayMs = this.expirationHours * 60 * 60 * 1000;
    await this.bookingQueue.add(
      BOOKING_EXPIRATION_JOB,
      { bookingId },
      {
        delay: delayMs,
        jobId: `expire-${bookingId}`,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );
    this.logger.log(
      `[booking-sm] Scheduled expiration for bookingId=${bookingId} in ${this.expirationHours}h`,
    );
  }

  private async cancelExpiration(bookingId: string): Promise<void> {
    const jobId = `expire-${bookingId}`;
    const job = await this.bookingQueue.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.log(
        `[booking-sm] Cancelled expiration job for bookingId=${bookingId}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Manager verification summary
  // -----------------------------------------------------------------------

  private buildManagerVerificationSummary(
    booking: BookingWithRelations,
    shortId: string,
  ): string {
    const dest =
      booking.offer.travelRequest.destination ?? 'N/A';
    const agencyName = booking.agency.name;
    const price = Number(booking.totalPrice).toLocaleString('en-US');
    const currency = booking.currency;

    // Traveler info
    const travelerName = [booking.user.firstName, booking.user.lastName]
      .filter(Boolean)
      .join(' ') || 'N/A';
    const tr = booking.offer.travelRequest;
    const travelers = tr.children
      ? `${tr.adults} adults, ${tr.children} children`
      : `${tr.adults} adults`;

    // Travel dates
    const offer = booking.offer;
    const depDate = offer.departureDate
      ? new Date(offer.departureDate).toLocaleDateString('en-GB')
      : 'N/A';
    const retDate = offer.returnDate
      ? new Date(offer.returnDate).toLocaleDateString('en-GB')
      : 'N/A';
    const nights = offer.nightsCount ? `${offer.nightsCount} nights` : '';

    // Hotel
    const hotel = offer.hotelName ?? 'Not specified';

    const lines = [
      `\ud83d\udccb *Booking Verification Required*`,
      ``,
      `*Booking:* \`${shortId}...\``,
      ``,
      `\ud83d\udc64 *Traveler*`,
      `Name: ${travelerName}`,
      `Group: ${travelers}`,
      ``,
      `\ud83c\udf0d *Trip Details*`,
      `Destination: ${dest}`,
      `Dates: ${depDate} — ${retDate}${nights ? ` (${nights})` : ''}`,
      `Hotel: ${hotel}`,
      ``,
      `\ud83c\udfe2 *Agency*`,
      `Name: ${agencyName}`,
      ``,
      `\ud83d\udcb0 *Price*`,
      `${price} ${currency}`,
    ];

    return lines.join('\n');
  }

  // -----------------------------------------------------------------------
  // Manager resolution: query real MANAGER users from DB
  // -----------------------------------------------------------------------

  private async getManagerChatIds(): Promise<number[]> {
    const managers = await this.prisma.user.findMany({
      where: {
        role: UserRole.MANAGER,
        status: UserStatus.ACTIVE,
      },
      select: { telegramId: true },
    });

    const chatIds = managers.map((m) => Number(m.telegramId));

    this.logger.log(
      `[booking-sm] Found ${chatIds.length} active manager(s): [${chatIds.join(', ')}]`,
    );

    // Include the channel group as fallback (if configured and not already covered)
    if (this.managerChannelChatId && !chatIds.includes(this.managerChannelChatId)) {
      chatIds.push(this.managerChannelChatId);
    }

    return chatIds;
  }

  // -----------------------------------------------------------------------
  // Notification builder
  // -----------------------------------------------------------------------

  private async buildNotifications(
    booking: BookingWithRelations,
    _fromStatus: BookingStatus,
    toStatus: BookingStatus,
  ): Promise<BookingNotification[]> {
    const notifications: BookingNotification[] = [];
    const shortId = booking.id.slice(0, 8);
    const dest =
      booking.offer.travelRequest.destination ?? 'Travel request';
    const agencyName = booking.agency.name;
    const price = Number(booking.totalPrice).toLocaleString('en-US');
    const currency = booking.currency;

    const travelerChatId = Number(booking.user.telegramId);
    const agentChatId = Number(
      booking.offer.membership.user.telegramId,
    );
    const agencyGroupChatId = booking.agency.agencyTelegramChatId
      ? Number(booking.agency.agencyTelegramChatId)
      : null;

    // Resolve manager chat IDs for statuses that need manager notification
    const managerStatuses: BookingStatus[] = [
      BookingStatus.AGENCY_CONFIRMED,
      BookingStatus.MEETING_SCHEDULED,
      BookingStatus.PAID,
      BookingStatus.CANCELLED,
      BookingStatus.REJECTED_BY_AGENCY,
    ];
    const managerChatIds = managerStatuses.includes(toStatus)
      ? await this.getManagerChatIds()
      : [];

    switch (toStatus) {
      case BookingStatus.AWAITING_AGENCY_CONFIRMATION:
        // Agency gets Confirm/Reject buttons
        {
          const agencyText =
            `\ud83d\udce8 *New Booking Request*\n\n` +
            `*Destination:* ${dest}\n` +
            `*Price:* ${price} ${currency}\n` +
            `*Booking:* \`${shortId}...\`\n\n` +
            `Please confirm or reject this booking.`;

          const buttons = [
            {
              label: '\u2705 Confirm',
              callbackData: `bk:confirm:${booking.id}`,
            },
            {
              label: '\u274c Reject',
              callbackData: `bk:reject:${booking.id}`,
            },
          ];

          notifications.push({
            chatId: agentChatId,
            text: agencyText,
            buttons,
          });
          if (agencyGroupChatId && agencyGroupChatId !== agentChatId) {
            notifications.push({
              chatId: agencyGroupChatId,
              text: agencyText,
              buttons,
            });
          }
        }
        break;

      case BookingStatus.AGENCY_CONFIRMED:
        notifications.push({
          chatId: travelerChatId,
          text:
            `\u2705 *Agency Confirmed!*\n\n` +
            `*${agencyName}* has confirmed your booking \`${shortId}...\`\n` +
            `Our manager will verify and send payment details shortly.`,
        });
        {
          const summaryText = this.buildManagerVerificationSummary(booking, shortId);
          const verifyButtons = [
            {
              label: '\u2705 Verify',
              callbackData: `bk:verify:${booking.id}`,
            },
            {
              label: '\u274c Cancel',
              callbackData: `bk:cancel:${booking.id}`,
            },
          ];
          for (const mgrChatId of managerChatIds) {
            notifications.push({
              chatId: mgrChatId,
              text: summaryText,
              buttons: verifyButtons,
            });
          }
        }
        break;

      case BookingStatus.MANAGER_VERIFIED:
        notifications.push({
          chatId: travelerChatId,
          text:
            `\u2705 *Booking Verified*\n\n` +
            `Your booking \`${shortId}...\` has been verified by our manager.`,
        });
        notifications.push({
          chatId: agentChatId,
          text: `\u2705 Booking \`${shortId}...\` has been verified by the manager.`,
        });
        break;

      case BookingStatus.MEETING_SCHEDULED:
        notifications.push({
          chatId: travelerChatId,
          text:
            `\ud83d\udcc5 *Meeting Scheduling*\n\n` +
            `Your booking \`${shortId}...\` is verified!\n` +
            `Please propose a convenient meeting time and location.`,
          buttons: [
            {
              label: '\ud83d\udcc5 Propose Meeting',
              callbackData: `mpw:start:${booking.id}`,
            },
          ],
        });
        {
          const meetingText =
            `\ud83d\udcc5 *Meeting Scheduling*\n\n` +
            `Booking \`${shortId}...\` is ready for a meeting.\n` +
            `*Destination:* ${dest}\n` +
            `*Price:* ${price} ${currency}\n\n` +
            `Waiting for traveler to propose meeting details.`;
          for (const mgrChatId of managerChatIds) {
            notifications.push({
              chatId: mgrChatId,
              text: meetingText,
              buttons: [
                {
                  label: '\u274c Cancel Booking',
                  callbackData: `bk:cancel:${booking.id}`,
                },
              ],
            });
          }
        }
        break;

      case BookingStatus.PAYMENT_PENDING:
        notifications.push({
          chatId: travelerChatId,
          text:
            `\ud83d\udcb3 *Payment Required*\n\n` +
            `Please proceed with payment for booking \`${shortId}...\`\n` +
            `*Amount:* ${price} ${currency}\n\n` +
            `Contact our manager for payment details.`,
        });
        break;

      case BookingStatus.PAID:
        notifications.push({
          chatId: agentChatId,
          text: `\ud83d\udcb0 Payment received for booking \`${shortId}...\` — ${price} ${currency}.`,
        });
        {
          const paidText =
            `\ud83d\udcb0 *Payment Confirmed*\n\n` +
            `*Booking:* \`${shortId}...\`\n` +
            `*Amount:* ${price} ${currency}`;
          const paidButtons = [
            {
              label: '\ud83d\ude80 Start trip',
              callbackData: `bk:start:${booking.id}`,
            },
          ];
          for (const mgrChatId of managerChatIds) {
            notifications.push({
              chatId: mgrChatId,
              text: paidText,
              buttons: paidButtons,
            });
          }
        }
        break;

      case BookingStatus.IN_PROGRESS:
        notifications.push({
          chatId: travelerChatId,
          text: `\u2708\ufe0f *Your trip has started!*\n\nBooking \`${shortId}...\` is now in progress. Have a great trip!`,
        });
        break;

      case BookingStatus.COMPLETED:
        notifications.push({
          chatId: travelerChatId,
          text:
            `\ud83c\udf89 *Trip Completed!*\n\n` +
            `Your booking \`${shortId}...\` has been completed.\n` +
            `Thank you for choosing Trip Yerevan!`,
        });
        notifications.push({
          chatId: agentChatId,
          text: `\u2705 Booking \`${shortId}...\` has been completed.`,
        });
        break;

      case BookingStatus.CANCELLED:
        {
          const cancelText =
            `\u274c *Booking Cancelled*\n\n` +
            `Booking \`${shortId}...\` has been cancelled.`;
          notifications.push({ chatId: travelerChatId, text: cancelText });
          notifications.push({ chatId: agentChatId, text: cancelText });
          for (const mgrChatId of managerChatIds) {
            notifications.push({ chatId: mgrChatId, text: cancelText });
          }
        }
        break;

      case BookingStatus.EXPIRED:
        {
          const expiredTraveler =
            `\u23f0 *Booking Expired*\n\n` +
            `Booking \`${shortId}...\` has expired because the agency did not confirm in time.`;
          notifications.push({
            chatId: travelerChatId,
            text: expiredTraveler,
          });
          notifications.push({
            chatId: agentChatId,
            text: `\u23f0 Booking \`${shortId}...\` has expired (not confirmed in time).`,
          });
        }
        break;

      case BookingStatus.REJECTED_BY_AGENCY:
        notifications.push({
          chatId: travelerChatId,
          text:
            `\u274c *Agency Rejected Booking*\n\n` +
            `Unfortunately, *${agencyName}* was unable to confirm booking \`${shortId}...\`\n` +
            `You can try accepting another offer.`,
        });
        {
          const rejectedText =
            `\u274c *Booking Rejected by Agency*\n\n` +
            `*Agency:* ${agencyName}\n` +
            `*Booking:* \`${shortId}...\``;
          for (const mgrChatId of managerChatIds) {
            notifications.push({ chatId: mgrChatId, text: rejectedText });
          }
        }
        break;
    }

    return notifications;
  }
}
