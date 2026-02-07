import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
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
  ): Promise<ProxyChat> {
    return this.prisma.proxyChat.create({
      data: { travelRequestId, userId, agencyId },
    });
  }

  async sendMessage(
    proxyChatId: string,
    senderType: MessageSenderType,
    senderId: string,
    content: string,
  ): Promise<ProxyChatMessage> {
    return this.prisma.proxyChatMessage.create({
      data: { proxyChatId, senderType, senderId, content },
    });
  }

  async close(id: string): Promise<ProxyChat> {
    return this.prisma.proxyChat.update({
      where: { id },
      data: { status: ProxyChatStatus.CLOSED, closedAt: new Date() },
    });
  }
}
