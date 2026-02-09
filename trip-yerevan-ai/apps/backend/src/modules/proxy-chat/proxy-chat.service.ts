import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  MessageContentType,
  MessageSenderType,
  ProxyChat,
  ProxyChatMessage,
  ProxyChatStatus,
} from '@prisma/client';

@Injectable()
export class ProxyChatService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ProxyChat | null> {
    return this.prisma.proxyChat.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async findByParticipants(
    travelRequestId: string,
    userId: string,
    agencyId: string,
  ): Promise<ProxyChat | null> {
    return this.prisma.proxyChat.findUnique({
      where: {
        travelRequestId_userId_agencyId: {
          travelRequestId,
          userId,
          agencyId,
        },
      },
    });
  }

  async create(
    travelRequestId: string,
    userId: string,
    agencyId: string,
    offerId?: string,
  ): Promise<ProxyChat> {
    return this.prisma.proxyChat.create({
      data: { travelRequestId, userId, agencyId, offerId },
    });
  }

  async sendMessage(
    proxyChatId: string,
    senderType: MessageSenderType,
    senderId: string,
    content: string,
    contentType: MessageContentType = MessageContentType.TEXT,
    telegramFileId?: string,
  ): Promise<ProxyChatMessage> {
    const [msg] = await this.prisma.$transaction([
      this.prisma.proxyChatMessage.create({
        data: { proxyChatId, senderType, senderId, content, contentType, telegramFileId },
      }),
      this.prisma.proxyChat.update({
        where: { id: proxyChatId },
        data: { lastActivityAt: new Date() },
      }),
    ]);
    return msg;
  }

  async close(id: string, closedReason?: string): Promise<ProxyChat> {
    return this.prisma.proxyChat.update({
      where: { id },
      data: {
        status: ProxyChatStatus.CLOSED,
        closedAt: new Date(),
        closedReason: closedReason ?? null,
      },
    });
  }

  async updateStatus(
    id: string,
    status: ProxyChatStatus,
    closedReason?: string,
  ): Promise<ProxyChat> {
    const data: Record<string, unknown> = { status };
    if (status === ProxyChatStatus.CLOSED) {
      data.closedAt = new Date();
      data.closedReason = closedReason ?? null;
    }
    return this.prisma.proxyChat.update({ where: { id }, data });
  }

  async assignManager(id: string, managerId: string): Promise<ProxyChat> {
    return this.prisma.proxyChat.update({
      where: { id },
      data: { managerId, status: ProxyChatStatus.MANAGER_ASSIGNED },
    });
  }

  async findByTravelRequest(travelRequestId: string): Promise<ProxyChat[]> {
    return this.prisma.proxyChat.findMany({
      where: { travelRequestId },
    });
  }

  async findInactiveChats(inactiveSince: Date): Promise<ProxyChat[]> {
    return this.prisma.proxyChat.findMany({
      where: {
        status: { in: [ProxyChatStatus.OPEN, ProxyChatStatus.BOOKED] },
        messages: {
          none: { createdAt: { gte: inactiveSince } },
        },
      },
    });
  }

  async reopen(id: string): Promise<ProxyChat> {
    return this.prisma.proxyChat.update({
      where: { id },
      data: {
        status: ProxyChatStatus.OPEN,
        closedAt: null,
        closedReason: null,
        reopenedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });
  }

  async getParticipantTelegramIds(proxyChatId: string): Promise<{
    travelerTelegramId: bigint;
    agentTelegramIds: bigint[];
    agencyGroupChatId: bigint | null;
  } | null> {
    const chat = await this.prisma.proxyChat.findUnique({
      where: { id: proxyChatId },
      include: {
        user: { select: { telegramId: true } },
        agency: {
          select: {
            agencyTelegramChatId: true,
            memberships: {
              where: { status: 'ACTIVE' },
              select: { user: { select: { telegramId: true } } },
            },
          },
        },
      },
    });
    if (!chat) return null;
    return {
      travelerTelegramId: chat.user.telegramId,
      agentTelegramIds: chat.agency.memberships.map((m) => m.user.telegramId),
      agencyGroupChatId: chat.agency.agencyTelegramChatId,
    };
  }
}
