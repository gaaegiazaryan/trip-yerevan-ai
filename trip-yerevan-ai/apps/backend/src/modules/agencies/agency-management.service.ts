import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  AgentRole,
  AgentStatus,
  AgencyStatus,
  RfqDeliveryStatus,
} from '@prisma/client';
import { WizardStepResult } from './agency-wizard.types';

interface AddManagerState {
  agencyId: string;
  ownerUserId: string;
}

interface OwnerAgencyInfo {
  agencyId: string;
  userId: string;
  agencyName: string;
}

interface AgentAgencyInfo extends OwnerAgencyInfo {
  role: AgentRole;
}

@Injectable()
export class AgencyManagementService {
  private readonly logger = new Logger(AgencyManagementService.name);
  private readonly addManagerStates = new Map<number, AddManagerState>();

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Permission helpers
  // ---------------------------------------------------------------------------

  async getOwnerAgency(telegramId: bigint): Promise<OwnerAgencyInfo | null> {
    const user = await this.prisma.user.findUnique({
      where: { telegramId },
      include: {
        agencyAgent: {
          include: { agency: true },
        },
      },
    });

    if (!user?.agencyAgent) return null;
    if (user.agencyAgent.role !== AgentRole.OWNER) return null;
    if (user.agencyAgent.status !== AgentStatus.ACTIVE) return null;
    if (user.agencyAgent.agency.status !== AgencyStatus.APPROVED) return null;

    return {
      agencyId: user.agencyAgent.agencyId,
      userId: user.id,
      agencyName: user.agencyAgent.agency.name,
    };
  }

  async getAgentAgency(telegramId: bigint): Promise<AgentAgencyInfo | null> {
    const user = await this.prisma.user.findUnique({
      where: { telegramId },
      include: {
        agencyAgent: {
          include: { agency: true },
        },
      },
    });

    if (!user?.agencyAgent) return null;
    if (user.agencyAgent.status !== AgentStatus.ACTIVE) return null;
    if (user.agencyAgent.agency.status !== AgencyStatus.APPROVED) return null;

    return {
      agencyId: user.agencyAgent.agencyId,
      userId: user.id,
      agencyName: user.agencyAgent.agency.name,
      role: user.agencyAgent.role,
    };
  }

  // ---------------------------------------------------------------------------
  // /set_agency_chat
  // ---------------------------------------------------------------------------

  async setAgencyChat(
    telegramId: bigint,
    chatId: number,
    chatTitle: string | undefined,
  ): Promise<WizardStepResult> {
    const owner = await this.getOwnerAgency(telegramId);
    if (!owner) {
      return { text: 'Only agency owners can set the agency chat.' };
    }

    await this.prisma.agency.update({
      where: { id: owner.agencyId },
      data: { agencyTelegramChatId: BigInt(chatId) },
    });

    this.logger.log(
      `[agency-chat-set] agencyId=${owner.agencyId}, chatId=${chatId}, ` +
        `title="${chatTitle ?? 'private'}"`,
    );

    return {
      text:
        `Agency chat set to *${chatTitle ?? 'this chat'}*.\n\n` +
        'RFQ notifications will be delivered here.',
    };
  }

  // ---------------------------------------------------------------------------
  // /add_manager
  // ---------------------------------------------------------------------------

  hasActiveAddManager(chatId: number): boolean {
    return this.addManagerStates.has(chatId);
  }

  cancelAddManager(chatId: number): void {
    this.addManagerStates.delete(chatId);
  }

  async startAddManager(
    chatId: number,
    telegramId: bigint,
  ): Promise<WizardStepResult> {
    const owner = await this.getOwnerAgency(telegramId);
    if (!owner) {
      return { text: 'Only agency owners can add managers.' };
    }

    this.addManagerStates.set(chatId, {
      agencyId: owner.agencyId,
      ownerUserId: owner.userId,
    });

    this.logger.log(
      `[agency-manager-add:started] chatId=${chatId}, agencyId=${owner.agencyId}`,
    );

    return {
      text: 'Forward a message from the person you want to add as a manager, or enter their Telegram ID:',
      buttons: [{ label: 'Cancel', callbackData: 'mgmt:cancel_add' }],
    };
  }

  async handleAddManagerInput(
    chatId: number,
    targetTelegramId: bigint,
  ): Promise<WizardStepResult> {
    const state = this.addManagerStates.get(chatId);
    if (!state) {
      return {
        text: 'No active add-manager flow. Use /add\\_manager to start.',
      };
    }

    this.addManagerStates.delete(chatId);

    // 1. Find user
    const user = await this.prisma.user.findUnique({
      where: { telegramId: targetTelegramId },
    });

    if (!user) {
      return {
        text: `User with Telegram ID \`${targetTelegramId}\` not found. They must /start the bot first.`,
      };
    }

    // 2. Check existing agency membership (userId is unique on agencyAgent)
    const existingAgent = await this.prisma.agencyAgent.findUnique({
      where: { userId: user.id },
    });

    if (existingAgent) {
      if (existingAgent.agencyId === state.agencyId) {
        return { text: 'This user is already a member of your agency.' };
      }
      return { text: 'This user is already a member of another agency.' };
    }

    // 3. Create agent
    await this.prisma.agencyAgent.create({
      data: {
        agencyId: state.agencyId,
        userId: user.id,
        role: AgentRole.MANAGER,
        status: AgentStatus.ACTIVE,
      },
    });

    const name = `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`;

    this.logger.log(
      `[agency-manager-added] agencyId=${state.agencyId}, userId=${user.id}, ` +
        `telegramId=${targetTelegramId}, name="${name}"`,
    );

    return {
      text: `Manager added successfully!\n\n*${name}* is now a manager of your agency.`,
    };
  }

  // ---------------------------------------------------------------------------
  // /agency dashboard
  // ---------------------------------------------------------------------------

  async buildDashboard(
    telegramId: bigint,
  ): Promise<WizardStepResult | null> {
    const agent = await this.getAgentAgency(telegramId);
    if (!agent) return null;

    const agency = await this.prisma.agency.findUniqueOrThrow({
      where: { id: agent.agencyId },
      include: {
        agents: {
          where: { status: AgentStatus.ACTIVE },
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    const stats = await this.getAgencyRfqStats(agent.agencyId);

    const lines = [
      `*${agency.name}* — Agency Dashboard`,
      '',
      `*Status:* ${agency.status}`,
      `*Managers:* ${agency.agents.length}`,
      `*Agency chat:* ${agency.agencyTelegramChatId ? 'Set' : 'Not set'}`,
      '',
      '*RFQ Statistics:*',
      `  Distributed: ${stats.totalDistributed}`,
      `  Delivered: ${stats.totalDelivered}`,
      `  Responded: ${stats.totalResponded}`,
      '',
      '*Team:*',
    ];

    for (const a of agency.agents) {
      const name = `${a.user.firstName}${a.user.lastName ? ' ' + a.user.lastName : ''}`;
      lines.push(`  \\- ${name} (${a.role})`);
    }

    const isOwner = agent.role === AgentRole.OWNER;

    const buttons = isOwner
      ? [
          { label: '➕ Add manager', callbackData: 'mgmt:add_manager' },
          { label: '📢 Set agency chat', callbackData: 'mgmt:set_chat_info' },
        ]
      : [];

    return { text: lines.join('\n'), buttons };
  }

  // ---------------------------------------------------------------------------
  // RFQ delivery helpers
  // ---------------------------------------------------------------------------

  async findActiveAgentTelegramIds(agencyId: string): Promise<bigint[]> {
    const agents = await this.prisma.agencyAgent.findMany({
      where: { agencyId, status: AgentStatus.ACTIVE },
      include: { user: { select: { telegramId: true } } },
    });
    return agents.map((a) => a.user.telegramId);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async getAgencyRfqStats(agencyId: string): Promise<{
    totalDistributed: number;
    totalDelivered: number;
    totalResponded: number;
  }> {
    const distributions = await this.prisma.rfqDistribution.findMany({
      where: { agencyId },
      select: { deliveryStatus: true },
    });

    const delivered = new Set<RfqDeliveryStatus>([
      RfqDeliveryStatus.DELIVERED,
      RfqDeliveryStatus.VIEWED,
      RfqDeliveryStatus.RESPONDED,
    ]);

    return {
      totalDistributed: distributions.length,
      totalDelivered: distributions.filter((d) =>
        delivered.has(d.deliveryStatus),
      ).length,
      totalResponded: distributions.filter(
        (d) => d.deliveryStatus === RfqDeliveryStatus.RESPONDED,
      ).length,
    };
  }
}
