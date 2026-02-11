import { Controller, Get, Logger, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ok, fail } from '../../common/dto/api-response.dto';
import { AdminService } from './admin.service';
import { AdminAnalyticsQueryDto } from './dto/admin-analytics.dto';

@Controller('admin/analytics')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN)
export class AdminAnalyticsController {
  private readonly logger = new Logger(AdminAnalyticsController.name);

  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  async getOverview(@Query() query: AdminAnalyticsQueryDto) {
    try {
      const data = await this.adminService.getOverviewAnalytics(query);
      return ok(data);
    } catch (err) {
      this.logger.error('Failed to load overview analytics', (err as Error).stack);
      return fail('Failed to load overview analytics. Please try again.');
    }
  }

  @Get('agencies')
  async getAgencies(@Query() query: AdminAnalyticsQueryDto) {
    try {
      const data = await this.adminService.getAgencyAnalytics(query);
      return ok(data);
    } catch (err) {
      this.logger.error('Failed to load agency analytics', (err as Error).stack);
      return fail('Failed to load agency analytics. Please try again.');
    }
  }

  @Get('managers')
  async getManagers(@Query() query: AdminAnalyticsQueryDto) {
    try {
      const data = await this.adminService.getManagerAnalytics(query);
      return ok(data);
    } catch (err) {
      this.logger.error('Failed to load manager analytics', (err as Error).stack);
      return fail('Failed to load manager analytics. Please try again.');
    }
  }
}
