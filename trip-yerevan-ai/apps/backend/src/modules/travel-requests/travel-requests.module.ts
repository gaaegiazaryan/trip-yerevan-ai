import { Module } from '@nestjs/common';
import { TravelRequestsService } from './travel-requests.service';
import { TravelRequestsController } from './travel-requests.controller';

@Module({
  controllers: [TravelRequestsController],
  providers: [TravelRequestsService],
  exports: [TravelRequestsService],
})
export class TravelRequestsModule {}
