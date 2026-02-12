import { DomainEvent } from './domain-event';

/**
 * Interface for domain event handlers.
 *
 * Each handler processes a single event type. Handlers self-register with
 * the EventBusService in their `onModuleInit()` lifecycle hook.
 *
 * @example
 * ```ts
 * @Injectable()
 * export class LogBookingCreated
 *   implements DomainEventHandler<BookingCreatedEvent>, OnModuleInit
 * {
 *   readonly eventName = 'booking.created';
 *   constructor(private readonly eventBus: EventBusService) {}
 *   onModuleInit() { this.eventBus.register(this); }
 *   async handle(event: BookingCreatedEvent): Promise<void> { ... }
 * }
 * ```
 */
export interface DomainEventHandler<TEvent extends DomainEvent = DomainEvent> {
  /** The event name this handler listens for */
  readonly eventName: string;

  /** Process the event. Errors are caught by the EventBus and logged. */
  handle(event: TEvent): Promise<void>;
}
