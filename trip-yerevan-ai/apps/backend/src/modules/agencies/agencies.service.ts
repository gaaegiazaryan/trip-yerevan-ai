import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Agency, AgencyStatus, AgencyMembershipStatus, Prisma } from '@prisma/client';

@Injectable()
export class AgenciesService {
  private readonly logger = new Logger(AgenciesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Agency | null> {
    return this.prisma.agency.findUnique({
      where: { id },
      include: { memberships: true },
    });
  }

  async findApproved(): Promise<Agency[]> {
    return this.prisma.agency.findMany({
      where: { status: AgencyStatus.APPROVED },
    });
  }

  async findMatchingAgencies(
    regions: string[],
    specializations: string[],
  ): Promise<Agency[]> {
    return this.prisma.agency.findMany({
      where: {
        status: AgencyStatus.APPROVED,
        OR: [
          { regions: { hasSome: regions } },
          { specializations: { hasSome: specializations } },
        ],
      },
    });
  }

  async create(data: Prisma.AgencyCreateInput): Promise<Agency> {
    return this.prisma.agency.create({ data });
  }

  async updateStatus(id: string, status: AgencyStatus): Promise<Agency> {
    return this.prisma.agency.update({
      where: { id },
      data: { status },
    });
  }

  async isActiveMember(telegramId: bigint): Promise<boolean> {
    try {
      const membership = await this.prisma.agencyMembership.findFirst({
        where: {
          user: { telegramId },
          status: AgencyMembershipStatus.ACTIVE,
        },
      });
      return !!membership;
    } catch (error) {
      this.logger.error(
        `[isActiveMember] Failed for telegramId=${telegramId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      return false;
    }
  }
}
