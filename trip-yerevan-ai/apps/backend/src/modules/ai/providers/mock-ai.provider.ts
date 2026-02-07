import { Injectable, Logger } from '@nestjs/common';
import {
  AIProviderInterface,
  AIProviderMessage,
  AIProviderResponse,
  TravelDraft,
  SupportedLanguage,
} from '../types';

/**
 * Regex-based mock AI provider. No LLM calls — extracts travel data
 * from user messages using pattern matching. Suitable for development,
 * testing, and running the full pipeline without API keys.
 */
@Injectable()
export class MockAiProvider implements AIProviderInterface {
  private readonly logger = new Logger(MockAiProvider.name);

  async parseMessage(
    userMessage: string,
    _conversationHistory: AIProviderMessage[],
    _currentDraft: TravelDraft,
    _language: SupportedLanguage,
  ): Promise<AIProviderResponse> {
    this.logger.debug(`Parsing message: "${userMessage.slice(0, 80)}..."`);

    const fields: Record<string, unknown>[] = [];
    const lower = userMessage.toLowerCase();

    this.extractDestination(userMessage, fields);
    this.extractDates(userMessage, fields);
    this.extractTravelers(userMessage, lower, fields);
    this.extractBudget(userMessage, lower, fields);
    this.extractDepartureCity(userMessage, fields);
    this.extractTripType(lower, fields);
    this.extractPreferences(lower, fields);
    this.extractChildrenAges(userMessage, fields);

    const isGreeting = /^(hi|hello|hey|привет|здравствуй|ողջույն|բարև)/i.test(lower.trim());
    const isCancellation = /\b(cancel|stop|отмен|стоп)\b/i.test(lower);
    const isConfirmation = /\b(yes|да|correct|верно|confirm|подтвер)\b/i.test(lower);
    const isCorrection = /\b(no[,.]?\s|change|correct|исправ|измен|нет[,.]?\s|не так)\b/i.test(lower);

    const response = JSON.stringify({
      extractedFields: fields,
      isGreeting,
      isCancellation,
      isConfirmation,
      isCorrection,
    });

    return {
      content: response,
      tokensUsed: 0,
      model: 'mock-regex-v1',
    };
  }

  private extractDestination(
    message: string,
    fields: Record<string, unknown>[],
  ): void {
    // "to Paris", "в Париж", "destination: Rome"
    const patterns = [
      /(?:to|в|destination[:\s]+)\s*([A-ZА-ЯЁ][a-zа-яё]+(?:\s[A-ZА-ЯЁ][a-zа-яё]+)*)/,
      /(?:fly|go|travel|поехать|лететь|хочу)\s+(?:to|в)\s+([A-ZА-ЯЁ][a-zа-яё]+(?:\s[A-ZА-ЯЁ][a-zа-яё]+)*)/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match?.[1]) {
        fields.push({
          slotName: 'destination',
          rawValue: match[1],
          parsedValue: match[1].trim(),
          confidence: 0.85,
        });
        return;
      }
    }
  }

  private extractDates(
    message: string,
    fields: Record<string, unknown>[],
  ): void {
    // ISO dates: 2026-03-15
    const isoPattern = /(\d{4}-\d{2}-\d{2})/g;
    const isoDates = [...message.matchAll(isoPattern)].map((m) => m[1]);

    // DD.MM.YYYY or DD/MM/YYYY
    const euPattern = /(\d{1,2})[./](\d{1,2})[./](\d{4})/g;
    const euDates = [...message.matchAll(euPattern)].map(
      (m) => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
    );

    const allDates = [...isoDates, ...euDates];

    if (allDates.length >= 1) {
      fields.push({
        slotName: 'departureDate',
        rawValue: allDates[0],
        parsedValue: allDates[0],
        confidence: 0.9,
      });
    }
    if (allDates.length >= 2) {
      fields.push({
        slotName: 'returnDate',
        rawValue: allDates[1],
        parsedValue: allDates[1],
        confidence: 0.9,
      });
    }
  }

  private extractTravelers(
    message: string,
    lower: string,
    fields: Record<string, unknown>[],
  ): void {
    // "2 adults", "3 взрослых"
    const adultsMatch = lower.match(/(\d+)\s*(?:adults?|взросл|человек|чел)/);
    if (adultsMatch) {
      fields.push({
        slotName: 'adults',
        rawValue: adultsMatch[1],
        parsedValue: parseInt(adultsMatch[1], 10),
        confidence: 0.9,
      });
    }

    // "2 children", "1 ребёнок"
    const childrenMatch = lower.match(/(\d+)\s*(?:children|child|kids?|дет|ребён|ребен)/);
    if (childrenMatch) {
      fields.push({
        slotName: 'children',
        rawValue: childrenMatch[1],
        parsedValue: parseInt(childrenMatch[1], 10),
        confidence: 0.9,
      });
    }

    // "1 infant", "1 младенец"
    const infantsMatch = lower.match(/(\d+)\s*(?:infants?|babies?|baby|младен)/);
    if (infantsMatch) {
      fields.push({
        slotName: 'infants',
        rawValue: infantsMatch[1],
        parsedValue: parseInt(infantsMatch[1], 10),
        confidence: 0.9,
      });
    }
  }

  private extractBudget(
    message: string,
    lower: string,
    fields: Record<string, unknown>[],
  ): void {
    // "$2000", "2000 USD", "бюджет 2000"
    const budgetMatch = message.match(
      /(?:\$|budget[:\s]*|бюджет[:\s]*)\s*(\d[\d,]*)\s*(usd|eur|rub|amd|руб)?/i,
    );
    if (budgetMatch) {
      const amount = parseInt(budgetMatch[1].replace(/,/g, ''), 10);
      fields.push({
        slotName: 'budgetMax',
        rawValue: budgetMatch[0],
        parsedValue: amount,
        confidence: 0.85,
      });

      const currencyRaw = budgetMatch[2]?.toUpperCase();
      if (currencyRaw) {
        const currencyMap: Record<string, string> = {
          USD: 'USD', EUR: 'EUR', RUB: 'RUB', AMD: 'AMD', РУБ: 'RUB',
        };
        fields.push({
          slotName: 'currency',
          rawValue: currencyRaw,
          parsedValue: currencyMap[currencyRaw] ?? 'USD',
          confidence: 0.9,
        });
      }
    }

    // "up to 3000"
    const upToMatch = lower.match(/up\s+to\s+(\d[\d,]*)/);
    if (upToMatch && !budgetMatch) {
      fields.push({
        slotName: 'budgetMax',
        rawValue: upToMatch[0],
        parsedValue: parseInt(upToMatch[1].replace(/,/g, ''), 10),
        confidence: 0.8,
      });
    }
  }

  private extractDepartureCity(
    message: string,
    fields: Record<string, unknown>[],
  ): void {
    // "from Moscow", "из Москвы"
    const match = message.match(
      /(?:from|из)\s+([A-ZА-ЯЁ][a-zа-яё]+(?:\s[A-ZА-ЯЁ][a-zа-яё]+)*)/,
    );
    if (match?.[1]) {
      fields.push({
        slotName: 'departureCity',
        rawValue: match[1],
        parsedValue: match[1].trim(),
        confidence: 0.85,
      });
    }
  }

  private extractTripType(
    lower: string,
    fields: Record<string, unknown>[],
  ): void {
    const tripTypes: Record<string, string> = {
      'package': 'PACKAGE_TOUR',
      'пакетный': 'PACKAGE_TOUR',
      'all inclusive': 'PACKAGE_TOUR',
      'flight only': 'FLIGHT_ONLY',
      'только перел': 'FLIGHT_ONLY',
      'hotel only': 'HOTEL_ONLY',
      'только отел': 'HOTEL_ONLY',
      'excursion': 'EXCURSION',
      'экскурси': 'EXCURSION',
    };

    for (const [pattern, type] of Object.entries(tripTypes)) {
      if (lower.includes(pattern)) {
        fields.push({
          slotName: 'tripType',
          rawValue: pattern,
          parsedValue: type,
          confidence: 0.85,
        });
        return;
      }
    }
  }

  private extractPreferences(
    lower: string,
    fields: Record<string, unknown>[],
  ): void {
    const knownPrefs: Record<string, string> = {
      'all inclusive': 'all_inclusive',
      'all-inclusive': 'all_inclusive',
      'олл инклюзив': 'all_inclusive',
      'direct flight': 'direct_flight',
      'прямой рейс': 'direct_flight',
      'sea view': 'sea_view',
      'вид на море': 'sea_view',
      'pool': 'pool',
      'бассейн': 'pool',
      'spa': 'spa',
      'спа': 'spa',
      'beach': 'beach',
      'пляж': 'beach',
    };

    const found: string[] = [];
    for (const [pattern, pref] of Object.entries(knownPrefs)) {
      if (lower.includes(pattern)) {
        found.push(pref);
      }
    }

    if (found.length > 0) {
      fields.push({
        slotName: 'preferences',
        rawValue: found.join(', '),
        parsedValue: [...new Set(found)],
        confidence: 0.8,
      });
    }
  }

  private extractChildrenAges(
    message: string,
    fields: Record<string, unknown>[],
  ): void {
    // "children ages: 5, 8" or "дети 3 и 7 лет"
    const match = message.match(
      /(?:ages?[:\s]*|лет[:\s]*|возраст[:\s]*)(\d{1,2}(?:\s*[,иand&]\s*\d{1,2})*)/i,
    );
    if (match?.[1]) {
      const ages = match[1]
        .split(/\s*[,иand&]\s*/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 0 && n <= 17);

      if (ages.length > 0) {
        fields.push({
          slotName: 'childrenAges',
          rawValue: match[1],
          parsedValue: ages,
          confidence: 0.85,
        });
      }
    }
  }
}
