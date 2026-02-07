/**
 * Tests for slot name normalization in AiParsingService.
 * Ensures snake_case and other LLM naming variations are mapped
 * to canonical camelCase slot names.
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

describe('AiParsingService — slot name normalization', () => {
  it('should normalize snake_case departure_city to camelCase departureCity', async () => {
    const provider = createMockProvider(JSON.stringify({
      extractedFields: [{
        slotName: 'departure_city',
        rawValue: 'Moscow',
        parsedValue: 'Moscow',
        confidence: 0.9,
      }],
      isGreeting: false,
      isCancellation: false,
      isConfirmation: false,
      isCorrection: false,
    }));

    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('from Moscow', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields).toHaveLength(1);
    expect(parseResult.extractedFields[0].slotName).toBe('departureCity');
    expect(parseResult.extractedFields[0].parsedValue).toBe('Moscow');
  });

  it('should normalize all snake_case slot names', async () => {
    const provider = createMockProvider(JSON.stringify({
      extractedFields: [
        { slotName: 'departure_date', rawValue: '2026-03-15', parsedValue: '2026-03-15', confidence: 0.9 },
        { slotName: 'return_date', rawValue: '2026-03-22', parsedValue: '2026-03-22', confidence: 0.9 },
        { slotName: 'trip_type', rawValue: 'package', parsedValue: 'PACKAGE_TOUR', confidence: 0.8 },
        { slotName: 'children_ages', rawValue: '5, 8', parsedValue: [5, 8], confidence: 0.9 },
        { slotName: 'budget_max', rawValue: '$2000', parsedValue: 2000, confidence: 0.85 },
        { slotName: 'budget_min', rawValue: '$1000', parsedValue: 1000, confidence: 0.85 },
      ],
      isGreeting: false,
      isCancellation: false,
      isConfirmation: false,
      isCorrection: false,
    }));

    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'EN');

    const names = parseResult.extractedFields.map((f) => f.slotName);
    expect(names).toEqual([
      'departureDate', 'returnDate', 'tripType', 'childrenAges', 'budgetMax', 'budgetMin',
    ]);
  });

  it('should pass through already-correct camelCase names', async () => {
    const provider = createMockProvider(JSON.stringify({
      extractedFields: [
        { slotName: 'departureCity', rawValue: 'Yerevan', parsedValue: 'Yerevan', confidence: 0.9 },
        { slotName: 'destination', rawValue: 'Paris', parsedValue: 'Paris', confidence: 0.9 },
      ],
      isGreeting: false,
      isCancellation: false,
      isConfirmation: false,
      isCorrection: false,
    }));

    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].slotName).toBe('departureCity');
    expect(parseResult.extractedFields[1].slotName).toBe('destination');
  });

  it('should skip unknown slot names', async () => {
    const provider = createMockProvider(JSON.stringify({
      extractedFields: [
        { slotName: 'destination', rawValue: 'Paris', parsedValue: 'Paris', confidence: 0.9 },
        { slotName: 'unknown_field', rawValue: 'test', parsedValue: 'test', confidence: 0.5 },
      ],
      isGreeting: false,
      isCancellation: false,
      isConfirmation: false,
      isCorrection: false,
    }));

    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields).toHaveLength(1);
    expect(parseResult.extractedFields[0].slotName).toBe('destination');
  });

  it('should handle case-insensitive normalization', async () => {
    const provider = createMockProvider(JSON.stringify({
      extractedFields: [
        { slotName: 'DepartureCity', rawValue: 'Yerevan', parsedValue: 'Yerevan', confidence: 0.9 },
        { slotName: 'BUDGET_MAX', rawValue: '$3000', parsedValue: 3000, confidence: 0.8 },
      ],
      isGreeting: false,
      isCancellation: false,
      isConfirmation: false,
      isCorrection: false,
    }));

    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('test', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields).toHaveLength(2);
    expect(parseResult.extractedFields[0].slotName).toBe('departureCity');
    expect(parseResult.extractedFields[1].slotName).toBe('budgetMax');
  });
});
