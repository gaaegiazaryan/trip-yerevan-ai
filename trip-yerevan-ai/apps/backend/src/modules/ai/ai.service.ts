import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  AIConversation,
  AIConversationStatus,
  AIMessage,
  AIMessageRole,
  AIModel,
} from '@prisma/client';

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveByUserId(userId: string): Promise<AIConversation | null> {
    return this.prisma.aIConversation.findFirst({
      where: { userId, status: AIConversationStatus.ACTIVE },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async create(userId: string, model: AIModel): Promise<AIConversation> {
    return this.prisma.aIConversation.create({
      data: { userId, model },
    });
  }

  async addMessage(
    conversationId: string,
    role: AIMessageRole,
    content: string,
    tokens?: number,
  ): Promise<AIMessage> {
    return this.prisma.aIMessage.create({
      data: { conversationId, role, content, tokens },
    });
  }

  async complete(
    conversationId: string,
    travelRequestId: string,
  ): Promise<AIConversation> {
    return this.prisma.aIConversation.update({
      where: { id: conversationId },
      data: {
        status: AIConversationStatus.COMPLETED,
        travelRequestId,
        completedAt: new Date(),
      },
    });
  }

  async abandon(conversationId: string): Promise<AIConversation> {
    return this.prisma.aIConversation.update({
      where: { id: conversationId },
      data: {
        status: AIConversationStatus.ABANDONED,
        completedAt: new Date(),
      },
    });
  }
}
