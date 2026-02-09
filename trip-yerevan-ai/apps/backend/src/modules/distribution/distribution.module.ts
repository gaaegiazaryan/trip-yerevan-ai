import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import {
  AgencyMatchingService,
  RfqNotificationBuilder,
  RfqDistributionService,
} from './services';
import { RfqDistributionProcessor } from './processors/rfq-distribution.processor';
import { RFQ_DISTRIBUTION_QUEUE } from './types';
import { TelegramModule } from '../telegram/telegram.module';
import { AgenciesModule } from '../agencies/agencies.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: RFQ_DISTRIBUTION_QUEUE,
    }),
    forwardRef(() => TelegramModule),
    AgenciesModule,
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
