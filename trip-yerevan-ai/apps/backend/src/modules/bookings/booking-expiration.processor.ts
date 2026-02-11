import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BookingStateMachineService } from './booking-state-machine.service';
import { TelegramService } from '../telegram/telegram.service';
import { BookingStatus } from '@prisma/client';
import { BOOKING_QUEUE } from './booking.constants';

export interface ExpirationJobData {
  bookingId: string;
}

@Processor(BOOKING_QUEUE)
export class BookingExpirationProcessor extends WorkerHost {
  private readonly logger = new Logger(BookingExpirationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingStateMachine: BookingStateMachineService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
  ) {
    super();
  }

  async process(job: Job<ExpirationJobData>): Promise<void> {
    const { bookingId } = job.data;

    this.logger.log(
      `[booking-expiration] Processing expiration for bookingId=${bookingId}`,
    );

    // Guard: only expire if still AWAITING_AGENCY_CONFIRMATION
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true },
    });

    if (!booking) {
      this.logger.warn(
        `[booking-expiration] Booking ${bookingId} not found, skipping`,
      );
      return;
    }

    if (booking.status !== BookingStatus.AWAITING_AGENCY_CONFIRMATION) {
      this.logger.log(
        `[booking-expiration] Booking ${bookingId} is ${booking.status}, not expiring`,
      );
      return;
    }

    const result = await this.bookingStateMachine.transition(
      bookingId,
      BookingStatus.EXPIRED,
      { reason: 'Agency did not confirm within the expiration window' },
    );

    if (!result.success) {
      this.logger.error(
        `[booking-expiration] Failed to expire booking ${bookingId}: ${result.error}`,
      );
      return;
    }

    // Send notifications
    for (const notification of result.notifications) {
      try {
        if (notification.buttons?.length) {
          await this.telegramService.sendRfqToAgency(
            notification.chatId,
            notification.text,
            notification.buttons,
          );
        } else {
          await this.telegramService.sendMessage(
            notification.chatId,
            notification.text,
          );
        }
      } catch (err) {
        this.logger.error(
          `[booking-expiration] Failed to notify chatId=${notification.chatId}: ${err}`,
        );
      }
    }

    this.logger.log(
      `[booking-expiration] Booking ${bookingId} expired, ${result.notifications.length} notifications sent`,
    );
  }
}
