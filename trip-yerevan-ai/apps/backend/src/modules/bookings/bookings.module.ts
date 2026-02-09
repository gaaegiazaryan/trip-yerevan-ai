import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingAcceptanceService } from './booking-acceptance.service';
import { BookingsController } from './bookings.controller';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService, BookingAcceptanceService],
  exports: [BookingsService, BookingAcceptanceService],
})
export class BookingsModule {}
