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
import { ok, paginated, fail } from '../../common/dto/api-response.dto';
import { AdminService } from './admin.service';
import {
  AdminMeetingsQueryDto,
  CounterProposeMeetingDto,
  CompleteMeetingDto,
  CancelMeetingDto,
} from './dto/admin-meetings.dto';

@Controller('admin/meetings')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN)
export class AdminMeetingsController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  async findAll(@Query() query: AdminMeetingsQueryDto) {
    const { data, total } = await this.adminService.findMeetings(query);
    return paginated(data, total, query.page, query.limit);
  }

  @Post(':id/confirm')
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') managerId: string,
  ) {
    const result = await this.adminService.confirmMeeting(id, managerId);

    if (!result.success) {
      return fail(result.error!);
    }

    return ok({
      message: 'Meeting confirmed.',
      meetingId: result.meetingId,
      bookingId: id,
    });
  }

  @Post(':id/counter-propose')
  async counterPropose(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CounterProposeMeetingDto,
    @CurrentUser('id') managerId: string,
  ) {
    const result = await this.adminService.counterProposeMeeting(
      id,
      dto,
      managerId,
    );

    if (!result.success) {
      return fail(result.error!);
    }

    return ok({
      message: 'Counter-proposal submitted.',
      proposalId: result.proposalId,
      bookingId: id,
    });
  }

  @Post(':id/complete')
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteMeetingDto,
    @CurrentUser('id') managerId: string,
  ) {
    const result = await this.adminService.completeMeeting(id, dto, managerId);

    if (!result.success) {
      return fail(result.error!);
    }

    return ok({
      message: 'Meeting completed.',
      bookingId: id,
      status: result.booking?.status ?? null,
    });
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelMeetingDto,
    @CurrentUser('id') managerId: string,
  ) {
    const result = await this.adminService.cancelMeeting(id, dto, managerId);

    if (!result.success) {
      return fail(result.error!);
    }

    return ok({
      message: 'Meeting cancelled.',
      meetingId: result.meetingId,
      bookingId: id,
    });
  }
}
