import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai.service';
import { AiParsingService } from './ai-parsing.service';
import { DraftMergeService } from './draft-merge.service';
import { SlotFillingService } from './slot-filling.service';
import { ConversationStateService } from './conversation-state.service';
import { ResponseGeneratorService } from './response-generator.service';
import { LanguageService } from './language.service';
import { FeedbackService } from './feedback.service';
import {
  ConversationState,
  ConversationResponse,
  TravelDraft,
  AIProviderMessage,
  SupportedLanguage,
  createEmptyDraft,
} from '../types';
import { AIMessageRole, AIModel } from '@prisma/client';

@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly parsing: AiParsingService,
    private readonly draftMerge: DraftMergeService,
    private readonly slotFilling: SlotFillingService,
    private readonly stateService: ConversationStateService,
    private readonly responseGenerator: ResponseGeneratorService,
    private readonly languageService: LanguageService,
    private readonly feedback: FeedbackService,
  ) {}

  async processMessage(
    userId: string,
    message: string,
  ): Promise<ConversationResponse> {
    // 1. Load or create conversation + draft
    const { conversationId, draft, state, history } =
      await this.loadOrCreate(userId);

    // 2. Detect language
    const language = this.languageService.detectLanguage(message);

    // 3. Persist user message
    await this.aiService.addMessage(
      conversationId,
      AIMessageRole.USER,
      message,
    );

    // 4. Parse via AIProvider → ParseResult
    const conversationHistory = this.buildHistory(history);
    const { parseResult, tokensUsed } = await this.parsing.parse(
      message,
      conversationHistory,
      draft,
      language,
    );

    // 5. Track tokens
    if (tokensUsed > 0) {
      await this.aiService.updateTokensUsed(conversationId, tokensUsed);
    }

    // 6. Merge into draft → new TravelDraft
    const mergedDraft = this.draftMerge.merge(draft, parseResult);

    // 7. Transition state machine
    const newState = this.stateService.transition(state, mergedDraft, parseResult);

    this.logger.debug(
      `[${conversationId}] ${state} → ${newState}, ` +
        `slots: ${this.slotFilling.getCompletionPercentage(mergedDraft)}%`,
    );

    // 8. Generate response
    const response = this.responseGenerator.generate(
      conversationId,
      newState,
      mergedDraft,
      parseResult,
      language,
    );

    // 9. Persist draft + assistant message
    await this.aiService.updateDraft(
      conversationId,
      mergedDraft,
      newState,
      language,
    );
    await this.aiService.addMessage(
      conversationId,
      AIMessageRole.ASSISTANT,
      response.textResponse,
    );

    // 10. Record feedback if correction
    if (parseResult.isCorrection) {
      await this.feedback.recordCorrection(conversationId, parseResult);
    }

    // 11. Handle terminal states
    if (newState === ConversationState.CANCELLED) {
      await this.aiService.abandon(conversationId);
      await this.feedback.recordAbandoned(conversationId);
    }

    return response;
  }

  async getConversationState(userId: string): Promise<{
    conversationId: string | null;
    draft: TravelDraft | null;
    state: ConversationState | null;
    completionPercentage: number;
  }> {
    const conversation = await this.aiService.findActiveByUserId(userId);
    if (!conversation) {
      return {
        conversationId: null,
        draft: null,
        state: null,
        completionPercentage: 0,
      };
    }

    const { draft, state } = await this.aiService.getDraft(conversation.id);

    return {
      conversationId: conversation.id,
      draft,
      state,
      completionPercentage: draft
        ? this.slotFilling.getCompletionPercentage(draft)
        : 0,
    };
  }

  private async loadOrCreate(userId: string): Promise<{
    conversationId: string;
    draft: TravelDraft;
    state: ConversationState;
    history: { role: string; content: string }[];
  }> {
    const existing = await this.aiService.findActiveByUserId(userId);

    if (existing) {
      const { draft, state } = await this.aiService.getDraft(existing.id);
      return {
        conversationId: existing.id,
        draft: draft ?? createEmptyDraft(),
        state: state ?? this.stateService.getInitialState(),
        history: existing.messages.map((m) => ({
          role: m.role.toLowerCase(),
          content: m.content,
        })),
      };
    }

    const conversation = await this.aiService.create(userId, AIModel.CLAUDE);
    const draft = createEmptyDraft();
    const state = this.stateService.getInitialState();

    await this.aiService.updateDraft(conversation.id, draft, state);

    return {
      conversationId: conversation.id,
      draft,
      state,
      history: [],
    };
  }

  private buildHistory(
    messages: { role: string; content: string }[],
  ): AIProviderMessage[] {
    return messages.map((m) => ({
      role: m.role as AIProviderMessage['role'],
      content: m.content,
    }));
  }
}
