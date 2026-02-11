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
  AdminTravelersQueryDto,
  SetVipDto,
  SetBlacklistDto,
} from './dto/admin-travelers.dto';

@Controller('admin/travelers')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN)
export class AdminTravelersController {
  private readonly logger = new Logger(AdminTravelersController.name);

  constructor(private readonly adminService: AdminService) {}

  @Get()
  async findAll(@Query() query: AdminTravelersQueryDto) {
    try {
      const { data, total } = await this.adminService.findTravelers(query);
      return paginated(data, total, query.page, query.limit);
    } catch (err) {
      this.logger.error('Failed to load travelers', (err as Error).stack);
      return fail('Failed to load travelers. Please try again.');
    }
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    try {
      const traveler = await this.adminService.findTravelerById(id);
      return ok(traveler);
    } catch (err) {
      if ((err as any).status === 404) {
        return fail('Traveler not found.');
      }
      this.logger.error('Failed to load traveler', (err as Error).stack);
      return fail('Failed to load traveler details. Please try again.');
    }
  }

  @Post(':id/vip')
  async setVip(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetVipDto,
    @CurrentUser('id') managerId: string,
  ) {
    try {
      await this.adminService.setVip(id, dto, managerId);
      return ok({
        message: `VIP ${dto.enabled ? 'enabled' : 'disabled'}.`,
        userId: id,
        vip: dto.enabled,
      });
    } catch (err) {
      if ((err as any).status === 404) {
        return fail('Traveler not found.');
      }
      this.logger.error('Failed to update VIP status', (err as Error).stack);
      return fail('Failed to update VIP status. Please try again.');
    }
  }

  @Post(':id/blacklist')
  async setBlacklist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBlacklistDto,
    @CurrentUser('id') managerId: string,
  ) {
    try {
      await this.adminService.setBlacklist(id, dto, managerId);
      return ok({
        message: dto.enabled
          ? 'Traveler has been blacklisted.'
          : 'Traveler has been removed from blacklist.',
        userId: id,
        blacklisted: dto.enabled,
      });
    } catch (err) {
      if ((err as any).status === 404) {
        return fail('Traveler not found.');
      }
      this.logger.error('Failed to update blacklist status', (err as Error).stack);
      return fail('Failed to update blacklist status. Please try again.');
    }
  }
}
