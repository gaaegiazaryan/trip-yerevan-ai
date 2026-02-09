import { Module } from '@nestjs/common';
import { AgenciesService } from './agencies.service';
import { AgenciesController } from './agencies.controller';
import { AgencyApplicationService } from './agency-application.service';
import { AgencyManagementService } from './agency-management.service';
import { AgencyMembershipService } from './agency-membership.service';

@Module({
  controllers: [AgenciesController],
  providers: [AgenciesService, AgencyApplicationService, AgencyManagementService, AgencyMembershipService],
  exports: [AgenciesService, AgencyApplicationService, AgencyManagementService, AgencyMembershipService],
})
export class AgenciesModule {}
