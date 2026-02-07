import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import {
  AgencyMatchingService,
  RfqNotificationBuilder,
  RfqDistributionService,
} from './services';
import { RfqDistributionProcessor } from './processors/rfq-distribution.processor';
import { RFQ_DISTRIBUTION_QUEUE } from './types';

@Module({
  imports: [
    BullModule.registerQueue({
      name: RFQ_DISTRIBUTION_QUEUE,
    }),
  ],
  providers: [
    AgencyMatchingService,
    RfqNotificationBuilder,
    RfqDistributionService,
    RfqDistributionProcessor,
  ],
  exports: [RfqDistributionService],
})
export class DistributionModule {}
