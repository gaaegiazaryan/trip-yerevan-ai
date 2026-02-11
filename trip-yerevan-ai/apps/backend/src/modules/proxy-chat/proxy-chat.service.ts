import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  CloseReason,
  MessageContentType,
  MessageSenderType,
  ProxyChat,
  ProxyChatMessage,
  ProxyChatState,
} from '@prisma/client';
import { VALID_TRANSITIONS } from './proxy-chat.constants';

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
    const now = new Date();
    const [msg] = await this.prisma.$transaction([
      this.prisma.proxyChatMessage.create({
        data: { proxyChatId, senderType, senderId, content, contentType, telegramFileId },
      }),
      this.prisma.proxyChat.update({
        where: { id: proxyChatId },
        data: { lastActivityAt: now, lastMessageAt: now, lastMessageBy: senderId },
      }),
    ]);
    return msg;
  }

  async close(id: string, closeReason?: CloseReason): Promise<ProxyChat> {
    return this.prisma.proxyChat.update({
      where: { id },
      data: {
        state: ProxyChatState.CLOSED,
        closedAt: new Date(),
        closeReason: closeReason ?? null,
      },
    });
  }

  async transitionState(
    id: string,
    toState: ProxyChatState,
    closeReason?: CloseReason,
  ): Promise<ProxyChat> {
    const chat = await this.prisma.proxyChat.findUniqueOrThrow({ where: { id } });
    const allowed = VALID_TRANSITIONS[chat.state];
    if (!allowed?.includes(toState)) {
      throw new Error(
        `Invalid state transition: ${chat.state} → ${toState}`,
      );
    }
    const data: Record<string, unknown> = { state: toState };
    if (toState === ProxyChatState.CLOSED) {
      data.closedAt = new Date();
      data.closeReason = closeReason ?? null;
    }
    return this.prisma.proxyChat.update({ where: { id }, data });
  }

  async assignManager(id: string, managerId: string): Promise<ProxyChat> {
    return this.prisma.proxyChat.update({
      where: { id },
      data: { managerId, state: ProxyChatState.ESCALATED },
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
        state: { in: [ProxyChatState.OPEN, ProxyChatState.REPLY_ONLY] },
        messages: {
          none: { createdAt: { gte: inactiveSince } },
        },
      },
    });
  }

  async reopen(id: string, offerId?: string): Promise<ProxyChat> {
    return this.prisma.proxyChat.update({
      where: { id },
      data: {
        state: ProxyChatState.OPEN,
        closedAt: null,
        closeReason: null,
        reopenedAt: new Date(),
        lastActivityAt: new Date(),
        ...(offerId && { offerId }),
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
