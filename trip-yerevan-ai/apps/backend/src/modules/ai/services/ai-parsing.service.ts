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
    this.logger.debug(
      `Calling provider.parseMessage: msg="${userMessage.slice(0, 80)}", ` +
        `historyLen=${conversationHistory.length}, lang=${language}`,
    );

    const response = await this.provider.parseMessage(
      userMessage,
      conversationHistory,
      currentDraft,
      language,
    );

    this.logger.debug(
      `Provider response: ${response.content.length} chars, ` +
        `tokens=${response.tokensUsed}, model=${response.model}, ` +
        `first100="${response.content.slice(0, 100)}"`,
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
    const fallback: ParseResult = {
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

    let cleaned: string;
    try {
      cleaned = this.extractJson(content);
    } catch (error) {
      this.logger.warn(
        `extractJson failed (${content.length} chars): ${error}`,
      );
      return fallback;
    }

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(cleaned);
    } catch (error) {
      this.logger.warn(
        `JSON.parse failed: ${error}. ` +
          `Content (${content.length} chars), first 300: "${content.slice(0, 300)}"`,
      );
      return fallback;
    }

    try {
      return {
        extractedFields: this.validateFields(raw.extractedFields as unknown[] ?? []),
        detectedLanguage: (raw.detectedLanguage as SupportedLanguage) ?? 'EN',
        overallConfidence: (raw.overallConfidence as number) ?? 0,
        suggestedQuestion: (raw.suggestedQuestion as string) ?? null,
        isGreeting: Boolean(raw.isGreeting),
        isCancellation: Boolean(raw.isCancellation),
        isConfirmation: Boolean(raw.isConfirmation),
        isCorrection: Boolean(raw.isCorrection),
        rawAiResponse: content,
      };
    } catch (error) {
      this.logger.error(
        `validateFields failed: ${error}. ` +
          `Raw fields: ${JSON.stringify(raw.extractedFields)?.slice(0, 500)}`,
      );
      return fallback;
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

      const rawValue = String(f.rawValue ?? '');
      let parsedValue = this.normalizeFieldValue(normalized, f.parsedValue ?? null);
      let confidence = typeof f.confidence === 'number' ? f.confidence : 0;

      // Post-process dates: detect hallucinated specific dates from vague input
      if ((normalized === 'departureDate' || normalized === 'returnDate') && typeof parsedValue === 'string') {
        const dateCheck = this.validateDateExtraction(rawValue, parsedValue, confidence);
        parsedValue = dateCheck.parsedValue;
        confidence = dateCheck.confidence;
      }

      result.push({
        slotName: normalized as ExtractedField['slotName'],
        rawValue,
        parsedValue,
        confidence,
      });
    }

    return result;
  }

  /**
   * Detect when the LLM hallucinated a specific date from vague user input.
   * If rawValue has no explicit day number but parsedValue is a full ISO date,
   * downgrade to a fuzzy period string with low confidence.
   */
  private validateDateExtraction(
    rawValue: string,
    parsedValue: string,
    confidence: number,
  ): { parsedValue: unknown; confidence: number } {
    // If already a fuzzy period (not ISO date), pass through
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedValue)) {
      return { parsedValue, confidence };
    }

    // Check if rawValue contains an explicit day number (1-31)
    // Match standalone numbers that look like day-of-month
    const hasExplicitDay = /(?:^|\s|-)(\d{1,2})(?:\s|$|[-./])/.test(rawValue)
      && this.extractDayFromRaw(rawValue);

    if (hasExplicitDay) {
      // User gave a specific day — trust the LLM's ISO date
      return { parsedValue, confidence };
    }

    // Vague input — LLM invented a specific day. Downgrade to fuzzy period.
    const date = new Date(parsedValue + 'T00:00:00');
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const fuzzy = `${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}`;

    this.logger.debug(
      `Date hallucination detected: raw="${rawValue}" → "${parsedValue}" downgraded to "${fuzzy}"`,
    );

    return { parsedValue: fuzzy, confidence: 0.4 };
  }

  /**
   * Check if the raw user input contains an actual day-of-month reference.
   * Filters out numbers that are clearly years (2025, 2026) or other non-day values.
   */
  private extractDayFromRaw(rawValue: string): boolean {
    // Match numbers in the raw value
    const numbers = rawValue.match(/\d+/g);
    if (!numbers) return false;

    for (const num of numbers) {
      const n = parseInt(num, 10);
      // Day-of-month: 1-31, but not a year (>= 2000)
      if (n >= 1 && n <= 31 && num.length <= 2) {
        return true;
      }
    }
    return false;
  }
}
