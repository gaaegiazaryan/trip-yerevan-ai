import { DomainEvent } from '../../../infra/events';

export interface BookingCreatedPayload {
  bookingId: string;
  offerId: string;
  userId: string;
  agencyId: string;
  travelRequestId: string;
  totalPrice: number;
  currency: string;
  destination: string | null;
  agencyName: string;
}

/**
 * Published when a traveler accepts an offer and a booking is created.
 *
 * This event fires AFTER the atomic transaction commits (booking + offer +
 * travel request status updates) but BEFORE any notifications are sent.
 *
 * Future handlers might:
 * - Send notifications (agent, agency group, manager channel)
 * - Schedule expiration jobs
 * - Update analytics counters
 * - Log to audit trail
 */
export class BookingCreatedEvent extends DomainEvent<BookingCreatedPayload> {
  constructor(payload: BookingCreatedPayload) {
    super('booking.created', payload);
  }
}
