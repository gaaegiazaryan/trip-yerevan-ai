import { Module } from '@nestjs/common';
import { AgenciesService } from './agencies.service';
import { AgenciesController } from './agencies.controller';
import { AgencyApplicationService } from './agency-application.service';

@Module({
  controllers: [AgenciesController],
  providers: [AgenciesService, AgencyApplicationService],
  exports: [AgenciesService, AgencyApplicationService],
})
export class AgenciesModule {}
