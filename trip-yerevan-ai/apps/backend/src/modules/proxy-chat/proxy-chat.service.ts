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
    return this.prisma.proxyChatMessage.create({
      data: { proxyChatId, senderType, senderId, content, contentType, telegramFileId },
    });
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
}
