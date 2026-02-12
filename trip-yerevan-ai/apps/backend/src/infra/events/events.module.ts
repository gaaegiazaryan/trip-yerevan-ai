import { Global, Module } from '@nestjs/common';
import { EventBusService } from './event-bus.service';

/**
 * Global event infrastructure module.
 *
 * Provides EventBusService to the entire application. Since this module is
 * @Global(), any service can inject EventBusService without importing.
 *
 * Handlers self-register by injecting EventBusService and calling
 * `this.eventBus.register(this)` in their `onModuleInit()` lifecycle hook.
 */
@Global()
@Module({
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventsModule {}
