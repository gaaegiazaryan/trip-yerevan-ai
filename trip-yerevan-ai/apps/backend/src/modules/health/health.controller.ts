import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const dbHealthy = await this.prisma.isHealthy();

    return {
      status: dbHealthy ? 'ok' : 'degraded',
      service: 'trip-yerevan-api',
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
      database: {
        status: dbHealthy ? 'connected' : 'disconnected',
      },
    };
  }
}
