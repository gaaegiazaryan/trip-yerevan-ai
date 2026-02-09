import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  AgencyMembership,
  AgencyMembershipStatus,
  AgencyRole,
} from '@prisma/client';

/** Minimal Prisma transaction client interface for composability. */
interface TxClient {
  agencyMembership: {
    create: typeof PrismaService.prototype.agencyMembership.create;
  };
}

@Injectable()
export class AgencyMembershipService {
  private readonly logger = new Logger(AgencyMembershipService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates an OWNER membership when an agency application is approved.
   * Accepts an optional transaction client for use within approval flow.
   */
  async createOwnerMembership(
    agencyId: string,
    userId: string,
    tx?: TxClient,
  ): Promise<AgencyMembership> {
    const client = tx ?? this.prisma;
    return client.agencyMembership.create({
      data: {
        agencyId,
        userId,
        role: AgencyRole.OWNER,
        status: AgencyMembershipStatus.ACTIVE,
      },
    });
  }

  /**
   * Adds a user as AGENT to an agency.
   * Multi-agency is allowed — only per-agency uniqueness is enforced.
   */
  async inviteAgent(
    agencyId: string,
    userId: string,
    invitedByUserId: string,
  ): Promise<AgencyMembership> {
    return this.prisma.agencyMembership.create({
      data: {
        agencyId,
        userId,
        role: AgencyRole.AGENT,
        status: AgencyMembershipStatus.ACTIVE,
        invitedByUserId,
      },
    });
  }

  /**
   * Activates an INVITED membership.
   */
  async activateAgent(membershipId: string): Promise<AgencyMembership> {
    return this.prisma.agencyMembership.update({
      where: { id: membershipId },
      data: { status: AgencyMembershipStatus.ACTIVE },
    });
  }

  /**
   * Disables a membership (soft removal).
   */
  async disableMember(membershipId: string): Promise<AgencyMembership> {
    return this.prisma.agencyMembership.update({
      where: { id: membershipId },
      data: { status: AgencyMembershipStatus.DISABLED },
    });
  }

  /**
   * Lists active members for an agency with user data.
   */
  async getActiveMembers(agencyId: string): Promise<AgencyMembership[]> {
    return this.prisma.agencyMembership.findMany({
      where: { agencyId, status: AgencyMembershipStatus.ACTIVE },
      include: { user: { select: { firstName: true, lastName: true, telegramId: true } } },
    });
  }

  /**
   * Returns Telegram IDs for all active members of an agency.
   */
  async findActiveMemberTelegramIds(agencyId: string): Promise<bigint[]> {
    const members = await this.prisma.agencyMembership.findMany({
      where: { agencyId, status: AgencyMembershipStatus.ACTIVE },
      include: { user: { select: { telegramId: true } } },
    });
    return members.map((m) => m.user.telegramId);
  }

  /**
   * Finds a user's active membership for a specific agency.
   */
  async findActiveMembership(
    userId: string,
    agencyId: string,
  ): Promise<AgencyMembership | null> {
    return this.prisma.agencyMembership.findFirst({
      where: { userId, agencyId, status: AgencyMembershipStatus.ACTIVE },
    });
  }

  /**
   * Finds all active memberships for a user (multi-agency support).
   */
  async findUserMemberships(userId: string): Promise<AgencyMembership[]> {
    return this.prisma.agencyMembership.findMany({
      where: { userId, status: AgencyMembershipStatus.ACTIVE },
      include: { agency: true },
    });
  }

  /**
   * Resolves the membership for a user, potentially auto-creating one
   * if the chatId matches an agency's telegramChatId.
   * Absorbs the auto-creation logic from OfferWizardService.resolveAgent().
   */
  async resolveOrCreateMembership(
    userId: string,
    chatId: number,
  ): Promise<{ id: string; agencyId: string } | null> {
    // 1. Check for any existing active membership
    const existing = await this.prisma.agencyMembership.findFirst({
      where: { userId, status: AgencyMembershipStatus.ACTIVE },
      select: { id: true, agencyId: true },
    });

    if (existing) {
      return existing;
    }

    // 2. Auto-create if chat matches an agency's telegramChatId
    const agency = await this.prisma.agency.findFirst({
      where: { telegramChatId: BigInt(chatId) },
    });

    if (!agency) {
      this.logger.warn(
        `[membership:no-agency] userId=${userId}, chatId=${chatId} doesn't match any agency`,
      );
      return null;
    }

    const membership = await this.prisma.agencyMembership.create({
      data: {
        agencyId: agency.id,
        userId,
        role: AgencyRole.AGENT,
        status: AgencyMembershipStatus.ACTIVE,
      },
    });

    this.logger.log(
      `[membership:auto-created] membershipId=${membership.id}, userId=${userId}, agencyId=${agency.id}`,
    );

    return { id: membership.id, agencyId: membership.agencyId };
  }
}
