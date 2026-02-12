import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ok, paginated, fail } from '../../common/dto/api-response.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationService } from '../../infra/notifications';
import {
  AdminNotificationsQueryDto,
  RetryFailedDto,
} from './dto/admin-notifications.dto';

@Controller('admin/notifications')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN)
export class AdminNotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  @Get()
  async findAll(@Query() query: AdminNotificationsQueryDto) {
    const where: Record<string, unknown> = {};

    if (query.status) where.status = query.status;
    if (query.channel) where.channel = query.channel;
    if (query.recipientId) where.recipientId = query.recipientId;
    if (query.eventName) where.eventName = query.eventName;

    const [data, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.notificationLog.count({ where }),
    ]);

    return paginated(data, total, query.page, query.limit);
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const log = await this.prisma.notificationLog.findUnique({
      where: { id },
    });

    if (!log) throw new NotFoundException('Notification not found');

    return ok(log);
  }

  @Post(':id/retry')
  async retryOne(@Param('id', ParseUUIDPipe) id: string) {
    const requeued = await this.notificationService.requeue(id);

    if (!requeued) {
      return fail('Cannot retry: notification not found or already SENT');
    }

    return ok({ id, requeued: true });
  }

  @Post('retry-failed')
  async retryFailed(@Body() body: RetryFailedDto) {
    const count = await this.notificationService.requeueFailed(body.limit);
    return ok({ requeuedCount: count });
  }
}
