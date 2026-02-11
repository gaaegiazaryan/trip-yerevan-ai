import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ok, paginated } from '../../common/dto/api-response.dto';
import { AdminService } from './admin.service';
import { AdminRiskEventsQueryDto } from './dto/admin-risk.dto';

@Controller('admin/risk')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN)
export class AdminRiskController {
  constructor(private readonly adminService: AdminService) {}

  @Get('events')
  async findAll(@Query() query: AdminRiskEventsQueryDto) {
    const { data, total } = await this.adminService.findRiskEvents(query);
    return paginated(data, total, query.page, query.limit);
  }

  @Get('events/:id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const event = await this.adminService.findRiskEventById(id);
    return ok(event);
  }
}
