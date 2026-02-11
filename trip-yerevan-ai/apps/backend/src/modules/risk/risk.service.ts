import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Prisma, RiskSeverity, RiskEntityType } from '@prisma/client';

export interface CreateRiskEventInput {
  entityType: RiskEntityType;
  entityId: string;
  severity: RiskSeverity;
  reason: string;
  payload?: Prisma.InputJsonValue;
}

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateRiskEventInput) {
    try {
      const event = await this.prisma.riskEvent.create({
        data: {
          entityType: input.entityType,
          entityId: input.entityId,
          severity: input.severity,
          reason: input.reason,
          payload: input.payload ?? undefined,
        },
      });
      this.logger.log(
        `RiskEvent created: id=${event.id} type=${input.entityType} severity=${input.severity} reason="${input.reason}"`,
      );
      return event;
    } catch (err) {
      this.logger.error('Failed to create RiskEvent', (err as Error).stack);
    }
  }
}
