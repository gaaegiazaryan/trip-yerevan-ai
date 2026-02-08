import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Agency, AgencyStatus, AgentStatus, Prisma } from '@prisma/client';

@Injectable()
export class AgenciesService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Agency | null> {
    return this.prisma.agency.findUnique({
      where: { id },
      include: { agents: true },
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

  async isActiveAgent(telegramId: bigint): Promise<boolean> {
    const agent = await this.prisma.agencyAgent.findFirst({
      where: {
        user: { telegramId },
        status: AgentStatus.ACTIVE,
      },
    });
    return !!agent;
  }
}
