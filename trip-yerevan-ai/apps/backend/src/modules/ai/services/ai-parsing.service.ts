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

/**
 * Canonical slot names in camelCase. Maps common LLM variations
 * (snake_case, lowercase, etc.) to the correct TravelDraft key.
 */
const SLOT_NAME_MAP: Record<string, string> = {
  destination: 'destination',
  departurecity: 'departureCity',
  departure_city: 'departureCity',
  departuredate: 'departureDate',
  departure_date: 'departureDate',
  returndate: 'returnDate',
  return_date: 'returnDate',
  triptype: 'tripType',
  trip_type: 'tripType',
  adults: 'adults',
  children: 'children',
  childrenages: 'childrenAges',
  children_ages: 'childrenAges',
  infants: 'infants',
  budgetmin: 'budgetMin',
  budget_min: 'budgetMin',
  budgetmax: 'budgetMax',
  budget_max: 'budgetMax',
  currency: 'currency',
  preferences: 'preferences',
  notes: 'notes',
};

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
      const cleaned = this.extractJson(content);
      const raw = JSON.parse(cleaned);
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
      this.logger.warn(
        `Failed to parse AI response (${content.length} chars), ` +
          `first 200: ${content.slice(0, 200)}`,
      );
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

  /**
   * Extract JSON from AI response that may be wrapped in markdown code fences
   * or contain leading/trailing text.
   */
  private extractJson(content: string): string {
    // Already valid JSON — fast path
    const trimmed = content.trim();
    if (trimmed.startsWith('{')) return trimmed;

    // Strip ```json ... ``` or ``` ... ``` code fences
    const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) return fenceMatch[1].trim();

    // Last resort: find first { to last }
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first !== -1 && last > first) return trimmed.slice(first, last + 1);

    return trimmed;
  }

  private normalizeSlotName(raw: string): string | null {
    // Exact match first (already camelCase)
    if (SLOT_NAME_MAP[raw]) return SLOT_NAME_MAP[raw];
    // Try lowercase normalization
    const lower = raw.toLowerCase();
    if (SLOT_NAME_MAP[lower]) return SLOT_NAME_MAP[lower];
    this.logger.warn(`Unknown slot name from AI: "${raw}", skipping`);
    return null;
  }

  private validateFields(raw: unknown[]): ExtractedField[] {
    if (!Array.isArray(raw)) return [];

    const result: ExtractedField[] = [];

    for (const item of raw) {
      if (typeof item !== 'object' || item === null || !('slotName' in item)) {
        continue;
      }
      const f = item as Record<string, unknown>;
      const normalized = this.normalizeSlotName(String(f.slotName));
      if (!normalized) continue;

      result.push({
        slotName: normalized as ExtractedField['slotName'],
        rawValue: String(f.rawValue ?? ''),
        parsedValue: f.parsedValue ?? null,
        confidence: typeof f.confidence === 'number' ? f.confidence : 0,
      });
    }

    return result;
  }
}
