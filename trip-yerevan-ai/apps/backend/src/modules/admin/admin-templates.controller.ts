import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { UserRole, Prisma } from '@prisma/client';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ok, paginated, fail } from '../../common/dto/api-response.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TemplateResolverService } from '../../infra/notifications';
import {
  AdminTemplatesQueryDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  ActivateTemplateDto,
  PreviewTemplateDto,
} from './dto/admin-templates.dto';

@Controller('admin/templates')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN)
export class AdminTemplatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templateResolver: TemplateResolverService,
  ) {}

  @Get()
  async findAll(@Query() query: AdminTemplatesQueryDto) {
    const where: Record<string, unknown> = {};

    if (query.templateKey) where.templateKey = query.templateKey;
    if (query.channel) where.channel = query.channel;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const [data, total] = await Promise.all([
      this.prisma.notificationTemplate.findMany({
        where,
        orderBy: [{ templateKey: 'asc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.limit,
        include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.notificationTemplate.count({ where }),
    ]);

    return paginated(data, total, query.page, query.limit);
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const template = await this.prisma.notificationTemplate.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!template) throw new NotFoundException('Template not found');

    return ok(template);
  }

  @Post()
  async create(@Body() dto: CreateTemplateDto, @Req() req: any) {
    try {
      const template = await this.prisma.notificationTemplate.create({
        data: {
          templateKey: dto.templateKey,
          version: dto.version,
          channel: dto.channel,
          body: dto.body,
          buttons: dto.buttons as unknown as Prisma.InputJsonValue,
          variables: dto.variables as unknown as Prisma.InputJsonValue,
          policyVersion: dto.policyVersion,
          createdById: req.user?.id ?? null,
          isActive: false,
        },
      });

      return ok(template);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Template with key="${dto.templateKey}", version="${dto.version}", channel="${dto.channel}" already exists`,
        );
      }
      throw error;
    }
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    const existing = await this.prisma.notificationTemplate.findUnique({
      where: { id },
    });

    if (!existing) throw new NotFoundException('Template not found');

    if (existing.isActive) {
      return fail(
        'Cannot edit an active template. Deactivate it first or create a new version.',
      );
    }

    const updated = await this.prisma.notificationTemplate.update({
      where: { id },
      data: {
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.buttons !== undefined && {
          buttons: dto.buttons as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.variables !== undefined && {
          variables: dto.variables as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.policyVersion !== undefined && {
          policyVersion: dto.policyVersion,
        }),
      },
    });

    return ok(updated);
  }

  /**
   * Activate a template version.
   * Atomically deactivates all other versions of the same (templateKey, channel)
   * and activates the specified one.
   */
  @Post('activate')
  async activate(@Body() dto: ActivateTemplateDto) {
    const target = await this.prisma.notificationTemplate.findUnique({
      where: { id: dto.templateId },
    });

    if (!target) throw new NotFoundException('Template not found');

    // Atomic swap: deactivate siblings, activate target
    await this.prisma.$transaction([
      this.prisma.notificationTemplate.updateMany({
        where: {
          templateKey: target.templateKey,
          channel: target.channel,
          isActive: true,
          id: { not: target.id },
        },
        data: { isActive: false },
      }),
      this.prisma.notificationTemplate.update({
        where: { id: target.id },
        data: { isActive: true },
      }),
    ]);

    return ok({
      id: target.id,
      templateKey: target.templateKey,
      version: target.version,
      channel: target.channel,
      activated: true,
    });
  }

  /**
   * Deactivate a template version.
   * Notifications will fall back to in-code templates.
   */
  @Post(':id/deactivate')
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    const existing = await this.prisma.notificationTemplate.findUnique({
      where: { id },
    });

    if (!existing) throw new NotFoundException('Template not found');

    if (!existing.isActive) {
      return ok({ id, deactivated: false, reason: 'Already inactive' });
    }

    await this.prisma.notificationTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    return ok({ id, deactivated: true });
  }

  /**
   * Preview a template with sample variables.
   * Does not persist anything — purely for admin review.
   */
  @Post('preview')
  async preview(@Body() dto: PreviewTemplateDto) {
    const result = this.templateResolver.preview(
      dto.body,
      dto.variables ?? {},
      dto.buttons,
    );

    return ok(result);
  }
}
