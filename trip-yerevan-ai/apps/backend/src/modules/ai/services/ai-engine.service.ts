import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai.service';
import { AiParsingService } from './ai-parsing.service';
import { DraftMergeService } from './draft-merge.service';
import { SlotFillingService } from './slot-filling.service';
import { ConversationStateService } from './conversation-state.service';
import { ResponseGeneratorService } from './response-generator.service';
import { LanguageService } from './language.service';
import { FeedbackService } from './feedback.service';
import { DraftToRequestService, ConversionResult } from './draft-to-request.service';
import { RfqDistributionService } from '../../distribution/services/rfq-distribution.service';
import {
  ConversationState,
  ConversationResponse,
  ParseResult,
  TravelDraft,
  AIProviderMessage,
  SupportedLanguage,
  createEmptyDraft,
} from '../types';
import { AIMessageRole, AIModel } from '@prisma/client';
import {
  DraftValidationException,
  DraftConversionException,
} from '../../../common/exceptions/domain.exception';

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
    private readonly draftToRequest: DraftToRequestService,
    private readonly rfqDistribution: RfqDistributionService,
  ) {}

  async processMessage(
    userId: string,
    message: string,
  ): Promise<ConversationResponse> {
    let conversationId = 'unknown';

    try {
      // 1. Load or create conversation + draft
      const loaded = await this.loadOrCreate(userId);
      conversationId = loaded.conversationId;
      const { draft, state, history } = loaded;

      this.logger.log(
        `[${conversationId}] Processing message (${message.length} chars), ` +
          `state=${state}, historyLen=${history.length}`,
      );

      // 2. Detect language
      const language = this.languageService.detectLanguage(message);

      // 3. Persist user message
      await this.aiService.addMessage(
        conversationId,
        AIMessageRole.USER,
        message,
      );

      // 4. Handle synthetic callback messages (from inline buttons)
      //    These bypass the LLM entirely — intent is already known.
      const synthetic = this.parseSyntheticMessage(message);
      if (synthetic) {
        this.logger.debug(
          `[${conversationId}] Synthetic message: ${message} → ` +
            `confirm=${synthetic.isConfirmation}, cancel=${synthetic.isCancellation}, correct=${synthetic.isCorrection}`,
        );
      }

      // 5. Parse via AIProvider → ParseResult (skip for synthetic messages)
      let parseResult: ParseResult;
      let tokensUsed = 0;

      if (synthetic) {
        parseResult = synthetic;
      } else {
        // Filter synthetic messages from history before sending to LLM
        const conversationHistory = this.buildHistory(
          history.filter((m) => !this.isSyntheticContent(m.content)),
        );
        const aiResult = await this.parsing.parse(
          message,
          conversationHistory,
          draft,
          language,
        );
        parseResult = aiResult.parseResult;
        tokensUsed = aiResult.tokensUsed;
      }

      this.logger.debug(
        `[${conversationId}] AI extraction: ${parseResult.extractedFields.length} fields: ` +
          `[${parseResult.extractedFields.map((f) => `${f.slotName}=${JSON.stringify(f.parsedValue)}@${f.confidence}`).join(', ')}]`,
      );

      // 6. Track tokens
      if (tokensUsed > 0) {
        await this.aiService.updateTokensUsed(conversationId, tokensUsed);
      }

      // 7. Merge into draft → new TravelDraft
      const mergedDraft = this.draftMerge.merge(draft, parseResult);

      this.logger.debug(
        `[${conversationId}] Draft merge: ` +
          `${this.slotFilling.getMissingRequired(draft).map((s) => s.name).join(',')} → ` +
          `${this.slotFilling.getMissingRequired(mergedDraft).map((s) => s.name).join(',') || '(all filled)'}`,
      );

      // 8. Transition state machine
      const newState = this.stateService.transition(state, mergedDraft, parseResult);

      const nextSlot = this.slotFilling.getNextSlotToAsk(mergedDraft);
      this.logger.log(
        `[${conversationId}] State: ${state} → ${newState}, ` +
          `completion: ${this.slotFilling.getCompletionPercentage(mergedDraft)}%, ` +
          `nextSlot: ${nextSlot?.name ?? 'none'}`,
      );

      // 9. Handle READY_FOR_RFQ → convert draft to TravelRequest
      if (newState === ConversationState.READY_FOR_RFQ) {
        return this.handleConversion(
          conversationId,
          userId,
          mergedDraft,
          language,
          parseResult,
        );
      }

      // 10. Generate response for non-terminal states
      const response = this.responseGenerator.generate(
        conversationId,
        newState,
        mergedDraft,
        parseResult,
        language,
      );

      // 11. Persist draft + assistant message
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

      // 12. Record feedback if correction
      if (parseResult.isCorrection) {
        await this.feedback.recordCorrection(conversationId, parseResult);
      }

      // 13. Handle cancellation
      if (newState === ConversationState.CANCELLED) {
        await this.aiService.abandon(conversationId);
        await this.feedback.recordAbandoned(conversationId);
      }

      return response;
    } catch (error) {
      this.logger.error(
        `[${conversationId}] processMessage FAILED for user=${userId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
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

  /**
   * Handles the critical READY_FOR_RFQ → COMPLETED transition:
   *   1. Validate + convert draft to TravelRequest (in transaction)
   *   2. Trigger RFQ distribution to agencies
   *   3. Record booking success feedback
   *   4. Return confirmed response
   *
   * On failure: stay in CONFIRMING_DRAFT, return error response.
   */
  private async handleConversion(
    conversationId: string,
    userId: string,
    draft: TravelDraft,
    language: SupportedLanguage,
    parseResult: Parameters<typeof this.responseGenerator.generate>[3],
  ): Promise<ConversationResponse> {
    try {
      // Convert draft → TravelRequest (transaction: create request + complete conversation)
      const result = await this.draftToRequest.convert(
        conversationId,
        userId,
        draft,
        language,
      );

      this.logger.log(
        `[${conversationId}] Draft converted → TravelRequest ${result.travelRequestId}`,
      );

      // Trigger distribution (non-blocking for the response)
      this.distributeInBackground(result);

      // Generate success response
      const response = this.responseGenerator.generate(
        conversationId,
        ConversationState.COMPLETED,
        draft,
        parseResult,
        language,
      );

      // Persist assistant message (conversation already completed in transaction)
      await this.aiService.addMessage(
        conversationId,
        AIMessageRole.ASSISTANT,
        response.textResponse,
      );

      return response;

    } catch (error) {
      return this.handleConversionFailure(
        error,
        conversationId,
        draft,
        language,
        parseResult,
      );
    }
  }

  /**
   * On conversion failure:
   *   - Do NOT change conversation state (stays in CONFIRMING_DRAFT)
   *   - Log structured error
   *   - Return recoverable response asking user to try again
   */
  private async handleConversionFailure(
    error: unknown,
    conversationId: string,
    draft: TravelDraft,
    language: SupportedLanguage,
    parseResult: Parameters<typeof this.responseGenerator.generate>[3],
  ): Promise<ConversationResponse> {
    if (error instanceof DraftValidationException) {
      this.logger.warn(
        `[${conversationId}] Draft validation failed: ${error.errors.map((e) => e.field).join(', ')}`,
      );

      // Stay in CONFIRMING_DRAFT — let user correct
      const errorText = this.buildValidationErrorText(error, language);

      await this.aiService.updateDraft(
        conversationId,
        draft,
        ConversationState.COLLECTING_DETAILS,
        language,
      );
      await this.aiService.addMessage(
        conversationId,
        AIMessageRole.ASSISTANT,
        errorText,
      );

      return {
        conversationId,
        state: ConversationState.COLLECTING_DETAILS,
        textResponse: errorText,
        draft,
        isComplete: false,
        suggestedActions: [],
        language,
      };
    }

    if (error instanceof DraftConversionException) {
      this.logger.error(
        `[${conversationId}] Draft conversion failed: ${error.message}`,
      );
    } else {
      this.logger.error(
        `[${conversationId}] Unexpected conversion error: ${error}`,
      );
    }

    // Fall back to CONFIRMING_DRAFT — let user retry
    const fallbackText = this.getFallbackText(language);

    await this.aiService.updateDraft(
      conversationId,
      draft,
      ConversationState.CONFIRMING_DRAFT,
      language,
    );
    await this.aiService.addMessage(
      conversationId,
      AIMessageRole.ASSISTANT,
      fallbackText,
    );

    return this.responseGenerator.generate(
      conversationId,
      ConversationState.CONFIRMING_DRAFT,
      draft,
      parseResult,
      language,
    );
  }

  private distributeInBackground(result: ConversionResult): void {
    this.rfqDistribution
      .distribute(result.travelRequestId)
      .then((dist) => {
        this.logger.log(
          `[${result.conversationId}] RFQ distributed to ${dist.totalAgenciesMatched} agencies`,
        );
      })
      .catch((err) => {
        this.logger.error(
          `[${result.conversationId}] RFQ distribution failed: ${err}`,
        );
      });
  }

  private buildValidationErrorText(
    error: DraftValidationException,
    language: SupportedLanguage,
  ): string {
    const fieldMessages = error.errors
      .map((e) => `- ${e.message}`)
      .join('\n');

    const prefix: Record<SupportedLanguage, string> = {
      RU: 'Не удалось создать заявку. Пожалуйста, исправьте:',
      AM: 'Could not create request. Please fix:',
      EN: 'Could not create the request. Please fix the following:',
    };

    return `${prefix[language]}\n${fieldMessages}`;
  }

  private getFallbackText(language: SupportedLanguage): string {
    const texts: Record<SupportedLanguage, string> = {
      RU: 'Произошла ошибка при создании заявки. Попробуйте подтвердить ещё раз.',
      AM: 'An error occurred while creating the request. Please try confirming again.',
      EN: 'An error occurred while creating the request. Please try confirming again.',
    };
    return texts[language];
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

  /**
   * Detect synthetic messages from inline keyboard callbacks.
   * These bypass the LLM — intent is already known from the button pressed.
   */
  private parseSyntheticMessage(message: string): ParseResult | null {
    const base: ParseResult = {
      extractedFields: [],
      detectedLanguage: 'EN',
      overallConfidence: 1.0,
      suggestedQuestion: null,
      isGreeting: false,
      isCancellation: false,
      isConfirmation: false,
      isCorrection: false,
      rawAiResponse: `[synthetic:${message}]`,
    };

    if (message === '__CONFIRM__') {
      return { ...base, isConfirmation: true };
    }
    if (message === '__CANCEL__') {
      return { ...base, isCancellation: true };
    }
    if (message.startsWith('__EDIT__')) {
      return { ...base, isCorrection: true };
    }

    return null;
  }

  /**
   * Check if a message is synthetic (from inline keyboard callbacks).
   * These should NOT be sent to the LLM as conversation history.
   */
  private isSyntheticContent(content: string): boolean {
    return content.startsWith('__CONFIRM__')
      || content.startsWith('__CANCEL__')
      || content.startsWith('__EDIT__')
      || content.startsWith('[synthetic:');
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
