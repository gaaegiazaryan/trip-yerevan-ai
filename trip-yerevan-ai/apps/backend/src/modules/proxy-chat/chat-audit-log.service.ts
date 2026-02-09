import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Prisma } from '@prisma/client';

export enum ChatAuditEvent {
  CHAT_CREATED = 'CHAT_CREATED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  MANAGER_ASSIGNED = 'MANAGER_ASSIGNED',
  MESSAGE_SENT = 'MESSAGE_SENT',
  MESSAGE_BLOCKED = 'MESSAGE_BLOCKED',
  CONTACT_LEAK_DETECTED = 'CONTACT_LEAK_DETECTED',
  CHAT_CLOSED = 'CHAT_CLOSED',
  CHAT_AUTO_CLOSED = 'CHAT_AUTO_CLOSED',
  CHAT_REOPENED = 'CHAT_REOPENED',
}

@Injectable()
export class ChatAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    proxyChatId: string,
    eventType: ChatAuditEvent,
    actorId?: string,
    details?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.chatAuditLog.create({
      data: {
        proxyChatId,
        eventType,
        actorId: actorId ?? null,
        details: details ?? undefined,
      },
    });
  }

  async findByChat(proxyChatId: string, limit = 50) {
    return this.prisma.chatAuditLog.findMany({
      where: { proxyChatId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
