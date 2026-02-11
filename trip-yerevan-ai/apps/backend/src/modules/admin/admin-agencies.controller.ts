import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ok, paginated, fail } from '../../common/dto/api-response.dto';
import { AdminService } from './admin.service';
import {
  AdminAgenciesQueryDto,
  VerifyAgencyDto,
  TrustBadgeDto,
} from './dto/admin-agencies.dto';
import {
  AgencyPerformanceQueryDto,
  AgencyRankingQueryDto,
} from './dto/admin-agency-performance.dto';

@Controller('admin/agencies')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN)
export class AdminAgenciesController {
  private readonly logger = new Logger(AdminAgenciesController.name);

  constructor(private readonly adminService: AdminService) {}

  @Get()
  async findAll(@Query() query: AdminAgenciesQueryDto) {
    try {
      const { data, total } = await this.adminService.findAgencies(query);
      return paginated(data, total, query.page, query.limit);
    } catch (err) {
      this.logger.error('Failed to load agencies', (err as Error).stack);
      return fail('Failed to load agencies. Please try again.');
    }
  }

  @Get('performance/ranking')
  async getPerformanceRanking(@Query() query: AgencyRankingQueryDto) {
    try {
      const data = await this.adminService.getAgencyPerformanceRanking(query);
      return ok(data);
    } catch (err) {
      this.logger.error('Failed to load agency ranking', (err as Error).stack);
      return fail('Failed to load agency ranking. Please try again.');
    }
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    try {
      const agency = await this.adminService.findAgencyById(id);
      return ok(agency);
    } catch (err) {
      if ((err as any).status === 404) {
        return fail('Agency not found.');
      }
      this.logger.error('Failed to load agency', (err as Error).stack);
      return fail('Failed to load agency details. Please try again.');
    }
  }

  @Get(':id/performance')
  async getPerformance(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AgencyPerformanceQueryDto,
  ) {
    try {
      const data = await this.adminService.getAgencyPerformance(id, query);
      return ok(data);
    } catch (err) {
      if ((err as any).status === 404) {
        return fail('Agency not found.');
      }
      this.logger.error('Failed to load agency performance', (err as Error).stack);
      return fail('Failed to load agency performance. Please try again.');
    }
  }

  @Post(':id/verify')
  async verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyAgencyDto,
    @CurrentUser('id') managerId: string,
  ) {
    try {
      const result = await this.adminService.verifyAgency(id, dto, managerId);
      const actionLabels = { APPROVE: 'approved', REJECT: 'rejected', BLOCK: 'blocked' };
      return ok({
        message: `Agency ${actionLabels[dto.action]} successfully.`,
        agencyId: id,
        status: result.agency.status,
      });
    } catch (err) {
      if ((err as any).status === 404) {
        return fail('Agency not found.');
      }
      this.logger.error('Failed to verify agency', (err as Error).stack);
      return fail('Failed to verify agency. Please try again.');
    }
  }

  @Post(':id/trust-badge')
  async setTrustBadge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TrustBadgeDto,
  ) {
    try {
      const result = await this.adminService.setTrustBadge(id, dto);
      return ok({
        message: `Trust badge ${dto.enabled ? 'enabled' : 'disabled'}.`,
        agencyId: id,
        trustBadge: result.agency.trustBadge,
      });
    } catch (err) {
      if ((err as any).status === 404) {
        return fail('Agency not found.');
      }
      this.logger.error('Failed to update trust badge', (err as Error).stack);
      return fail('Failed to update trust badge. Please try again.');
    }
  }
}
