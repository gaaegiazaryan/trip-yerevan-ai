import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { FeedbackSignal, FeedbackType, ParseResult } from '../types';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordSignal(signal: FeedbackSignal): Promise<void> {
    await this.prisma.aIFeedbackSignal.create({
      data: {
        conversationId: signal.conversationId,
        type: signal.type,
        fieldName: signal.fieldName,
        originalValue: signal.originalValue as never,
        correctedValue: signal.correctedValue as never,
        metadata: signal.metadata as never,
      },
    });

    this.logger.debug(
      `Recorded ${signal.type} signal for conversation ${signal.conversationId}`,
    );
  }

  async recordCorrection(
    conversationId: string,
    parseResult: ParseResult,
  ): Promise<void> {
    if (!parseResult.isCorrection) return;

    for (const field of parseResult.extractedFields) {
      await this.recordSignal({
        conversationId,
        type: FeedbackType.USER_CORRECTION,
        fieldName: field.slotName,
        originalValue: null,
        correctedValue: field.parsedValue,
        metadata: { confidence: field.confidence },
      });
    }
  }

  async recordAbandoned(
    conversationId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.recordSignal({
      conversationId,
      type: FeedbackType.ABANDONED,
      fieldName: null,
      originalValue: null,
      correctedValue: null,
      metadata: metadata ?? {},
    });
  }

  async recordBookingSuccess(
    conversationId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.recordSignal({
      conversationId,
      type: FeedbackType.BOOKING_SUCCESS,
      fieldName: null,
      originalValue: null,
      correctedValue: null,
      metadata: metadata ?? {},
    });
  }

  async getSignalsByConversation(
    conversationId: string,
  ): Promise<FeedbackSignal[]> {
    const records = await this.prisma.aIFeedbackSignal.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    return records.map((r) => ({
      conversationId: r.conversationId,
      type: r.type as FeedbackType,
      fieldName: r.fieldName as FeedbackSignal['fieldName'],
      originalValue: r.originalValue,
      correctedValue: r.correctedValue,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
    }));
  }
}
