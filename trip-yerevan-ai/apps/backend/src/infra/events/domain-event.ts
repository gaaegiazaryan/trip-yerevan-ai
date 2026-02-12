import { randomUUID } from 'node:crypto';

/**
 * Base class for all domain events.
 *
 * Every business-meaningful state change should be expressed as a DomainEvent.
 * Services publish events via EventBusService; handlers react asynchronously.
 *
 * @example
 * ```ts
 * export class BookingCreatedEvent extends DomainEvent<BookingCreatedPayload> {
 *   constructor(payload: BookingCreatedPayload) {
 *     super('booking.created', payload);
 *   }
 * }
 * ```
 */
export abstract class DomainEvent<TPayload = unknown> {
  /** Unique event instance ID (for idempotency / tracing) */
  readonly id: string;

  /** When this event occurred */
  readonly occurredAt: Date;

  /** Dot-delimited event name, e.g. "booking.created" */
  readonly eventName: string;

  /** Event-specific data */
  readonly payload: TPayload;

  protected constructor(eventName: string, payload: TPayload) {
    this.id = randomUUID();
    this.occurredAt = new Date();
    this.eventName = eventName;
    this.payload = payload;
  }
}
