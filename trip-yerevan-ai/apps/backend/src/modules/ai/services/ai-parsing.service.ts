import { Inject, Injectable, Logger } from '@nestjs/common';
import { AI_PROVIDER } from '../providers/ai-provider.token';
import {
  AIProviderInterface,
  AIProviderMessage,
  ParseResult,
  ExtractedField,
  TravelDraft,
  SupportedLanguage,
} from '../types';

@Injectable()
export class AiParsingService {
  private readonly logger = new Logger(AiParsingService.name);

  constructor(
    @Inject(AI_PROVIDER)
    private readonly provider: AIProviderInterface,
  ) {}

  async parse(
    userMessage: string,
    conversationHistory: AIProviderMessage[],
    currentDraft: TravelDraft,
    language: SupportedLanguage,
  ): Promise<{ parseResult: ParseResult; tokensUsed: number }> {
    const response = await this.provider.parseMessage(
      userMessage,
      conversationHistory,
      currentDraft,
      language,
    );

    const parseResult = this.parseResponse(response.content);

    this.logger.debug(
      `Extracted ${parseResult.extractedFields.length} fields, ` +
        `greeting=${parseResult.isGreeting}, cancel=${parseResult.isCancellation}, ` +
        `confirm=${parseResult.isConfirmation}, correction=${parseResult.isCorrection}`,
    );

    return { parseResult, tokensUsed: response.tokensUsed };
  }

  private parseResponse(content: string): ParseResult {
    try {
      const raw = JSON.parse(content);
      return {
        extractedFields: this.validateFields(raw.extractedFields ?? []),
        detectedLanguage: raw.detectedLanguage ?? 'EN',
        overallConfidence: raw.overallConfidence ?? 0,
        suggestedQuestion: raw.suggestedQuestion ?? null,
        isGreeting: Boolean(raw.isGreeting),
        isCancellation: Boolean(raw.isCancellation),
        isConfirmation: Boolean(raw.isConfirmation),
        isCorrection: Boolean(raw.isCorrection),
        rawAiResponse: content,
      };
    } catch {
      this.logger.warn('Failed to parse AI response, returning empty result');
      return {
        extractedFields: [],
        detectedLanguage: 'EN',
        overallConfidence: 0,
        suggestedQuestion: null,
        isGreeting: false,
        isCancellation: false,
        isConfirmation: false,
        isCorrection: false,
        rawAiResponse: content,
      };
    }
  }

  private validateFields(raw: unknown[]): ExtractedField[] {
    if (!Array.isArray(raw)) return [];

    return raw
      .filter(
        (f): f is Record<string, unknown> =>
          typeof f === 'object' && f !== null && 'slotName' in f,
      )
      .map((f) => ({
        slotName: String(f.slotName) as ExtractedField['slotName'],
        rawValue: String(f.rawValue ?? ''),
        parsedValue: f.parsedValue ?? null,
        confidence: typeof f.confidence === 'number' ? f.confidence : 0,
      }));
  }
}
