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
  AdminBookingsQueryDto,
  VerifyBookingDto,
  KanbanQueryDto,
  AssignManagerDto,
  SetStatusDto,
  RescheduleProposalDto,
} from './dto/admin-bookings.dto';

@Controller('admin/bookings')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN)
export class AdminBookingsController {
  private readonly logger = new Logger(AdminBookingsController.name);

  constructor(private readonly adminService: AdminService) {}

  @Get()
  async findAll(@Query() query: AdminBookingsQueryDto) {
    const { data, total } = await this.adminService.findBookings(query);
    return paginated(data, total, query.page, query.limit);
  }

  // Must be declared before :id to prevent "kanban" being parsed as UUID
  @Get('kanban')
  async getKanban(@Query() query: KanbanQueryDto) {
    try {
      const columns = await this.adminService.findKanbanBookings(query);
      return ok(columns);
    } catch (err) {
      this.logger.error('Failed to load kanban', (err as Error).stack);
      return fail('Failed to load pipeline. Please try again.');
    }
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const booking = await this.adminService.findBookingById(id);
    return ok(booking);
  }

  @Post(':id/verify')
  async verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyBookingDto,
    @CurrentUser('id') managerId: string,
  ) {
    const result = await this.adminService.verifyBooking(id, dto, managerId);

    if (!result.success) {
      return fail(result.error!);
    }

    const action = dto.action === 'CONFIRM' ? 'verified' : 'rejected';
    return ok({
      message: `Booking ${action} successfully.`,
      bookingId: id,
      status: result.booking?.status ?? null,
    });
  }

  @Post(':id/assign-manager')
  async assignManager(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignManagerDto,
  ) {
    try {
      await this.adminService.assignManager(id, dto.managerId);
      return ok({ message: 'Manager assigned.', bookingId: id });
    } catch (err) {
      if ((err as any).status === 422) {
        return fail((err as any).response?.message ?? 'Invalid manager.');
      }
      this.logger.error('Failed to assign manager', (err as Error).stack);
      return fail('Failed to assign manager. Please try again.');
    }
  }

  @Post(':id/set-status')
  async setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStatusDto,
    @CurrentUser('id') managerId: string,
  ) {
    try {
      const result = await this.adminService.setBookingStatus(
        id,
        dto.status,
        dto.reason,
        managerId,
      );

      if (!result.success) {
        return fail(result.error!);
      }

      return ok({
        message: `Status changed to ${dto.status}.`,
        bookingId: id,
        status: dto.status,
      });
    } catch (err) {
      this.logger.error('Failed to change status', (err as Error).stack);
      return fail('Failed to change booking status. Please try again.');
    }
  }

  @Post(':id/reschedule-proposal')
  async rescheduleProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleProposalDto,
    @CurrentUser('id') managerId: string,
  ) {
    try {
      const result = await this.adminService.rescheduleMeeting(
        id,
        { dateTime: dto.suggestedAt, location: dto.location },
        managerId,
      );

      if (!result.success) {
        return fail(result.error!);
      }

      return ok({
        message: 'Meeting rescheduled.',
        bookingId: id,
      });
    } catch (err) {
      this.logger.error('Failed to reschedule meeting', (err as Error).stack);
      return fail('Failed to reschedule meeting. Please try again.');
    }
  }
}
