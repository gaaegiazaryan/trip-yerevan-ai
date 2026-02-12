import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, Prisma } from '@prisma/client';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ok, paginated } from '../../common/dto/api-response.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationPreferenceResolver } from '../../infra/notifications';
import {
  AdminPoliciesQueryDto,
  UpdatePolicyDto,
  AdminRoleDefaultsQueryDto,
  UpdateRoleDefaultDto,
} from './dto/admin-notification-policies.dto';

@Controller('admin/notification-policies')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN)
export class AdminNotificationPoliciesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preferenceResolver: NotificationPreferenceResolver,
  ) {}

  // ==========================================
  // System Notification Policies
  // ==========================================

  @Get()
  async findAllPolicies(@Query() query: AdminPoliciesQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.category) where.category = query.category;

    const [data, total] = await Promise.all([
      this.prisma.systemNotificationPolicy.findMany({
        where,
        orderBy: { templateKey: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.systemNotificationPolicy.count({ where }),
    ]);

    return paginated(data, total, query.page, query.limit);
  }

  @Put(':templateKey')
  async updatePolicy(
    @Param('templateKey') templateKey: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    const policy = await this.prisma.systemNotificationPolicy.upsert({
      where: { templateKey },
      update: {
        category: dto.category,
        allowedChannels: dto.allowedChannels as unknown as Prisma.InputJsonValue,
        forceDeliver: dto.forceDeliver,
      },
      create: {
        templateKey,
        category: dto.category,
        allowedChannels: dto.allowedChannels as unknown as Prisma.InputJsonValue,
        forceDeliver: dto.forceDeliver,
      },
    });

    // Invalidate cache after policy change
    this.preferenceResolver.clearCache();

    return ok(policy);
  }

  // ==========================================
  // Role Notification Defaults
  // ==========================================

  @Get('role-defaults')
  async findAllRoleDefaults(@Query() query: AdminRoleDefaultsQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.role) where.role = query.role;
    if (query.category) where.category = query.category;

    const data = await this.prisma.roleNotificationDefault.findMany({
      where,
      orderBy: [{ role: 'asc' }, { category: 'asc' }, { channel: 'asc' }],
    });

    return ok(data);
  }

  @Put('role-defaults')
  async updateRoleDefault(@Body() dto: UpdateRoleDefaultDto) {
    const roleDefault = await this.prisma.roleNotificationDefault.upsert({
      where: {
        role_category_channel: {
          role: dto.role,
          category: dto.category,
          channel: dto.channel,
        },
      },
      update: { enabled: dto.enabled },
      create: {
        role: dto.role,
        category: dto.category,
        channel: dto.channel,
        enabled: dto.enabled,
      },
    });

    // Invalidate cache after role default change
    this.preferenceResolver.clearCache();

    return ok(roleDefault);
  }
}
