import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent } from './domain-event';
import { DomainEventHandler } from './domain-event-handler.interface';

/**
 * In-process domain event bus.
 *
 * - Publishes events to registered handlers by eventName
 * - Handlers run asynchronously (fire-and-forget by default)
 * - Each handler is isolated: one failing handler does not block others
 * - All publications and failures are logged
 *
 * Handlers self-register by calling `eventBus.register(this)` in their
 * `onModuleInit()` lifecycle hook.
 */
@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  private readonly handlerMap = new Map<string, DomainEventHandler[]>();

  /**
   * Register a handler for its declared eventName.
   * Handlers should call this from their onModuleInit().
   */
  register(handler: DomainEventHandler): void {
    const { eventName } = handler;
    const existing = this.handlerMap.get(eventName) ?? [];
    existing.push(handler);
    this.handlerMap.set(eventName, existing);

    this.logger.log(
      `[event-bus] Registered handler ${handler.constructor.name} for "${eventName}"`,
    );
  }

  /**
   * Publish a domain event. All matching handlers are invoked asynchronously.
   * Errors in individual handlers are caught and logged — they never propagate
   * to the publisher.
   */
  async publish<T extends DomainEvent>(event: T): Promise<void> {
    this.logger.log(
      `[event-bus] Publishing "${event.eventName}" (id=${event.id})`,
    );

    const handlers = this.handlerMap.get(event.eventName);

    if (!handlers || handlers.length === 0) {
      this.logger.debug(
        `[event-bus] No handlers registered for "${event.eventName}"`,
      );
      return;
    }

    const promises = handlers.map(async (handler) => {
      const handlerName = handler.constructor.name;
      try {
        await handler.handle(event);
        this.logger.debug(
          `[event-bus] ${handlerName} handled "${event.eventName}" (id=${event.id})`,
        );
      } catch (error) {
        this.logger.error(
          `[event-bus] ${handlerName} failed on "${event.eventName}" (id=${event.id}): ${error}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Publish multiple events in order. Useful after a transaction commits.
   */
  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  /**
   * Returns registered event names (useful for diagnostics).
   */
  getRegisteredEvents(): string[] {
    return [...this.handlerMap.keys()];
  }
}
