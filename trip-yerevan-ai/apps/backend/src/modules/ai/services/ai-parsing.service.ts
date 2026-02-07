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
 * Enum normalization maps. LLMs return diverse forms — we normalize
 * to the canonical values expected by the domain layer.
 */
const TRIP_TYPE_NORMALIZATION: Record<string, string> = {
  // English
  'package_tour': 'PACKAGE_TOUR',
  'package tour': 'PACKAGE_TOUR',
  'packagetour': 'PACKAGE_TOUR',
  'package': 'PACKAGE_TOUR',
  'tour': 'PACKAGE_TOUR',
  'flight_only': 'FLIGHT_ONLY',
  'flight only': 'FLIGHT_ONLY',
  'flightonly': 'FLIGHT_ONLY',
  'flight': 'FLIGHT_ONLY',
  'hotel_only': 'HOTEL_ONLY',
  'hotel only': 'HOTEL_ONLY',
  'hotelonly': 'HOTEL_ONLY',
  'hotel': 'HOTEL_ONLY',
  'excursion': 'EXCURSION',
  'custom': 'CUSTOM',
  // Russian
  'пакетный тур': 'PACKAGE_TOUR',
  'пакет': 'PACKAGE_TOUR',
  'тур': 'PACKAGE_TOUR',
  'только перелёт': 'FLIGHT_ONLY',
  'только перелет': 'FLIGHT_ONLY',
  'перелёт': 'FLIGHT_ONLY',
  'перелет': 'FLIGHT_ONLY',
  'только отель': 'HOTEL_ONLY',
  'отель': 'HOTEL_ONLY',
  'экскурсия': 'EXCURSION',
};

const CURRENCY_NORMALIZATION: Record<string, string> = {
  'usd': 'USD', '$': 'USD', 'dollar': 'USD', 'dollars': 'USD', 'доллар': 'USD',
  'eur': 'EUR', '€': 'EUR', 'euro': 'EUR', 'евро': 'EUR',
  'rub': 'RUB', '₽': 'RUB', 'рубль': 'RUB', 'рублей': 'RUB', 'руб': 'RUB',
  'amd': 'AMD', '֏': 'AMD', 'драм': 'AMD',
};

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

  /**
   * Normalize parsed values for enum-type fields.
   * LLMs return diverse forms — map to canonical domain values.
   */
  private normalizeFieldValue(slotName: string, value: unknown): unknown {
    if (value === null || value === undefined) return null;

    if (slotName === 'tripType' && typeof value === 'string') {
      const upper = value.toUpperCase();
      // Direct match on canonical enum
      if (['PACKAGE_TOUR', 'FLIGHT_ONLY', 'HOTEL_ONLY', 'EXCURSION', 'CUSTOM'].includes(upper)) {
        return upper;
      }
      const lower = value.toLowerCase().trim();
      return TRIP_TYPE_NORMALIZATION[lower] ?? value;
    }

    if (slotName === 'currency' && typeof value === 'string') {
      const upper = value.toUpperCase();
      if (['USD', 'EUR', 'RUB', 'AMD'].includes(upper)) return upper;
      const lower = value.toLowerCase().trim();
      return CURRENCY_NORMALIZATION[lower] ?? value;
    }

    // Coerce numeric slots to numbers
    if (['adults', 'children', 'infants', 'budgetMin', 'budgetMax'].includes(slotName)) {
      if (typeof value === 'string') {
        const parsed = Number(value);
        return isNaN(parsed) ? value : parsed;
      }
    }

    return value;
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
        parsedValue: this.normalizeFieldValue(normalized, f.parsedValue ?? null),
        confidence: typeof f.confidence === 'number' ? f.confidence : 0,
      });
    }

    return result;
  }
}
