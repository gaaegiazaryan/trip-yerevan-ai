import {
  Controller,
  Get,
  Put,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { NotificationCategory, NotificationChannel } from '@prisma/client';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ok } from '../../common/dto/api-response.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UpdateUserPreferencesDto } from '../../common/dto/user-notification-preferences.dto';

@Controller('me/notification-preferences')
@UseGuards(AuthGuard)
export class UserNotificationPreferencesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getPreferences(@Req() req: any) {
    const user = req.user;
    if (!user) throw new UnauthorizedException();

    const preferences = await this.prisma.userNotificationPreference.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        category: true,
        channel: true,
        enabled: true,
      },
      orderBy: [{ category: 'asc' }, { channel: 'asc' }],
    });

    return ok(preferences);
  }

  @Put()
  async updatePreferences(
    @Req() req: any,
    @Body() dto: UpdateUserPreferencesDto,
  ) {
    const user = req.user;
    if (!user) throw new UnauthorizedException();

    // Validate: cannot disable all CRITICAL channels
    const criticalPrefs = dto.preferences.filter(
      (p) => p.category === NotificationCategory.CRITICAL,
    );
    if (criticalPrefs.length > 0) {
      const allCriticalDisabled = criticalPrefs.every((p) => !p.enabled);
      if (allCriticalDisabled) {
        throw new BadRequestException(
          'Cannot disable all channels for CRITICAL notifications',
        );
      }
    }

    // Validate: allowed channels per policy
    const templatePolicies = await this.prisma.systemNotificationPolicy.findMany({
      select: { category: true, allowedChannels: true },
    });

    const allowedByCategory = new Map<NotificationCategory, Set<string>>();
    for (const policy of templatePolicies) {
      const channels = policy.allowedChannels as string[];
      const existing = allowedByCategory.get(policy.category) ?? new Set();
      for (const ch of channels) existing.add(ch);
      allowedByCategory.set(policy.category, existing);
    }

    for (const pref of dto.preferences) {
      const allowed = allowedByCategory.get(pref.category);
      if (allowed && allowed.size > 0 && !allowed.has(pref.channel)) {
        throw new BadRequestException(
          `Channel ${pref.channel} is not allowed for ${pref.category} notifications`,
        );
      }
    }

    // Upsert each preference
    const results = await Promise.all(
      dto.preferences.map((pref) =>
        this.prisma.userNotificationPreference.upsert({
          where: {
            userId_category_channel: {
              userId: user.id,
              category: pref.category,
              channel: pref.channel,
            },
          },
          update: { enabled: pref.enabled },
          create: {
            userId: user.id,
            category: pref.category,
            channel: pref.channel,
            enabled: pref.enabled,
          },
          select: {
            id: true,
            category: true,
            channel: true,
            enabled: true,
          },
        }),
      ),
    );

    return ok(results);
  }
}
