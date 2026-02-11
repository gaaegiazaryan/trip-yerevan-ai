import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ok, fail } from '../../common/dto/api-response.dto';
import { AdminService } from './admin.service';
import {
  AdminCalendarQueryDto,
  RescheduleMeetingDto,
} from './dto/admin-calendar.dto';

@Controller('admin/calendar')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN)
export class AdminCalendarController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  async getCalendarEvents(@Query() query: AdminCalendarQueryDto) {
    const events = await this.adminService.getCalendarEvents(query);
    return ok(events);
  }

  @Post(':id/reschedule')
  async reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleMeetingDto,
    @CurrentUser('id') managerId: string,
  ) {
    const result = await this.adminService.rescheduleMeeting(
      id,
      dto,
      managerId,
    );

    if (!result.success) {
      return fail(result.error!);
    }

    return ok({
      message: 'Meeting rescheduled.',
      meetingId: result.meetingId,
      bookingId: id,
    });
  }
}
