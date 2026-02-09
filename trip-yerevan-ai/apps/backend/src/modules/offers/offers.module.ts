import { Module } from '@nestjs/common';
import { OffersService } from './offers.service';
import { OffersController } from './offers.controller';
import { OfferWizardService } from './offer-wizard.service';
import { OfferViewerService } from './offer-viewer.service';
import { AgenciesModule } from '../agencies/agencies.module';

@Module({
  imports: [AgenciesModule],
  controllers: [OffersController],
  providers: [OffersService, OfferWizardService, OfferViewerService],
  exports: [OffersService, OfferWizardService, OfferViewerService],
})
export class OffersModule {}
