import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DomainEventHandler, EventBusService } from '../../../infra/events';
import { BookingCreatedEvent } from './booking-created.event';

/**
 * Example handler: logs every BookingCreatedEvent.
 *
 * Self-registers with the EventBus on module init. In production you would
 * add handlers for notifications, analytics, audit trails, etc.
 */
@Injectable()
export class LogBookingCreatedHandler
  implements DomainEventHandler<BookingCreatedEvent>, OnModuleInit
{
  private readonly logger = new Logger(LogBookingCreatedHandler.name);

  readonly eventName = 'booking.created';

  constructor(private readonly eventBus: EventBusService) {}

  onModuleInit() {
    this.eventBus.register(this);
  }

  async handle(event: BookingCreatedEvent): Promise<void> {
    const p = event.payload;
    this.logger.log(
      `[domain-event] Booking created: ` +
        `bookingId=${p.bookingId}, ` +
        `agency="${p.agencyName}", ` +
        `dest="${p.destination}", ` +
        `price=${p.totalPrice} ${p.currency}, ` +
        `eventId=${event.id}`,
    );
  }
}
