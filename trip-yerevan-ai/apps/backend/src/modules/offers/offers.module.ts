import { Module } from '@nestjs/common';
import { OffersService } from './offers.service';
import { OffersController } from './offers.controller';
import { OfferWizardService } from './offer-wizard.service';

@Module({
  controllers: [OffersController],
  providers: [OffersService, OfferWizardService],
  exports: [OffersService, OfferWizardService],
})
export class OffersModule {}
