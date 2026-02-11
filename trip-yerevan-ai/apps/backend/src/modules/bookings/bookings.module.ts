import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BookingsService } from './bookings.service';
import { BookingAcceptanceService } from './booking-acceptance.service';
import { BookingStateMachineService } from './booking-state-machine.service';
import { BookingCallbackHandler } from './booking-callback.handler';
import { BookingExpirationProcessor } from './booking-expiration.processor';
import { BookingsController } from './bookings.controller';
import { TelegramModule } from '../telegram/telegram.module';
import { BOOKING_QUEUE } from './booking.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: BOOKING_QUEUE }),
    forwardRef(() => TelegramModule),
  ],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    BookingAcceptanceService,
    BookingStateMachineService,
    BookingCallbackHandler,
    BookingExpirationProcessor,
  ],
  exports: [
    BookingsService,
    BookingAcceptanceService,
    BookingStateMachineService,
    BookingCallbackHandler,
  ],
})
export class BookingsModule {}
