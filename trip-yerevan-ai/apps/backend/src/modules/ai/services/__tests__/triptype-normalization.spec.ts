/**
 * Tests for tripType and currency enum normalization in AiParsingService.
 * Ensures LLM output variations (Russian, English, mixed case, partial phrases)
 * are mapped to canonical enum values.
 */
import { AiParsingService } from '../ai-parsing.service';
import { AIProviderInterface, AIProviderResponse, createEmptyDraft } from '../../types';

function createMockProvider(response: string): AIProviderInterface {
  return {
    parseMessage: jest.fn().mockResolvedValue({
      content: response,
      tokensUsed: 100,
      model: 'test',
    } satisfies AIProviderResponse),
  };
}

function buildResponse(fields: Record<string, unknown>[]): string {
  return JSON.stringify({
    extractedFields: fields.map((f) => ({
      slotName: f.slotName,
      rawValue: f.rawValue ?? f.parsedValue,
      parsedValue: f.parsedValue,
      confidence: f.confidence ?? 0.9,
    })),
    isGreeting: false,
    isCancellation: false,
    isConfirmation: false,
    isCorrection: false,
  });
}

describe('AiParsingService — tripType normalization', () => {
  it('should pass through canonical PACKAGE_TOUR', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'tripType', parsedValue: 'PACKAGE_TOUR' },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('package tour', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe('PACKAGE_TOUR');
  });

  it('should normalize lowercase "package tour"', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'tripType', parsedValue: 'package tour' },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe('PACKAGE_TOUR');
  });

  it('should normalize "Package Tour" (mixed case)', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'tripType', parsedValue: 'Package Tour' },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe('PACKAGE_TOUR');
  });

  it('should normalize Russian "пакетный тур"', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'tripType', parsedValue: 'пакетный тур' },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('пакетный тур', [], createEmptyDraft(), 'RU');

    expect(parseResult.extractedFields[0].parsedValue).toBe('PACKAGE_TOUR');
  });

  it('should normalize Russian "только перелёт" → FLIGHT_ONLY', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'tripType', parsedValue: 'только перелёт' },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'RU');

    expect(parseResult.extractedFields[0].parsedValue).toBe('FLIGHT_ONLY');
  });

  it('should normalize "flight only" → FLIGHT_ONLY', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'tripType', parsedValue: 'flight only' },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe('FLIGHT_ONLY');
  });

  it('should normalize "hotel only" → HOTEL_ONLY', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'tripType', parsedValue: 'hotel only' },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe('HOTEL_ONLY');
  });

  it('should normalize Russian "экскурсия" → EXCURSION', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'tripType', parsedValue: 'экскурсия' },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'RU');

    expect(parseResult.extractedFields[0].parsedValue).toBe('EXCURSION');
  });

  it('should normalize partial phrase "package" → PACKAGE_TOUR', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'tripType', parsedValue: 'package' },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe('PACKAGE_TOUR');
  });

  it('should normalize case-insensitive "HOTEL_ONLY"', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'tripType', parsedValue: 'hotel_only' },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe('HOTEL_ONLY');
  });
});

describe('AiParsingService — currency normalization', () => {
  it('should normalize "$" → USD', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'currency', parsedValue: '$' },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe('USD');
  });

  it('should normalize Russian "рублей" → RUB', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'currency', parsedValue: 'рублей' },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'RU');

    expect(parseResult.extractedFields[0].parsedValue).toBe('RUB');
  });

  it('should pass through canonical "USD"', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'currency', parsedValue: 'USD' },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe('USD');
  });
});

describe('AiParsingService — numeric coercion', () => {
  it('should coerce string "2" to number 2 for adults', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'adults', parsedValue: '2' },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe(2);
    expect(typeof parseResult.extractedFields[0].parsedValue).toBe('number');
  });

  it('should pass through numeric values unchanged', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'adults', parsedValue: 3 },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe(3);
  });

  it('should coerce string budgetMax to number', async () => {
    const provider = createMockProvider(buildResponse([
      { slotName: 'budgetMax', parsedValue: '2000' },
    ]));
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe(2000);
  });
});
