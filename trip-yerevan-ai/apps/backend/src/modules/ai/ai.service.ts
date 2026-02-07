import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  AIConversation,
  AIConversationStatus,
  AIMessage,
  AIMessageRole,
  AIModel,
  Prisma,
} from '@prisma/client';
import { TravelDraft } from './types';
import { ConversationState } from './types';

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveByUserId(
    userId: string,
  ): Promise<(AIConversation & { messages: AIMessage[] }) | null> {
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

  async updateDraft(
    conversationId: string,
    draft: TravelDraft,
    state: ConversationState,
    language?: string,
  ): Promise<AIConversation> {
    const current = await this.prisma.aIConversation.findUniqueOrThrow({
      where: { id: conversationId },
    });

    const snapshots = (current.draftSnapshots as Prisma.JsonArray) ?? [];
    if (current.draftData) {
      snapshots.push(current.draftData as Prisma.JsonValue);
    }

    return this.prisma.aIConversation.update({
      where: { id: conversationId },
      data: {
        draftData: draft as unknown as Prisma.InputJsonValue,
        draftSnapshots: snapshots as unknown as Prisma.InputJsonValue,
        conversationState: state,
        ...(language ? { detectedLanguage: language } : {}),
      },
    });
  }

  async getDraft(
    conversationId: string,
  ): Promise<{ draft: TravelDraft | null; state: ConversationState | null }> {
    const conv = await this.prisma.aIConversation.findUniqueOrThrow({
      where: { id: conversationId },
    });

    return {
      draft: conv.draftData as unknown as TravelDraft | null,
      state: conv.conversationState as ConversationState | null,
    };
  }

  async updateTokensUsed(
    conversationId: string,
    additionalTokens: number,
  ): Promise<void> {
    await this.prisma.aIConversation.update({
      where: { id: conversationId },
      data: { tokensUsed: { increment: additionalTokens } },
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
        conversationState: ConversationState.COMPLETED,
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
        conversationState: ConversationState.CANCELLED,
        completedAt: new Date(),
      },
    });
  }
}
