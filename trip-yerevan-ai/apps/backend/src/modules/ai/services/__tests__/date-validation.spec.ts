/**
 * Tests for date hallucination detection in AiParsingService.
 * Ensures vague date inputs ("в марте", "mid March") are NOT converted
 * to specific ISO dates, while explicit dates ("March 15", "10-17 марта") pass through.
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

function buildDateResponse(
  slotName: string,
  rawValue: string,
  parsedValue: string,
  confidence: number = 0.9,
): string {
  return JSON.stringify({
    extractedFields: [
      { slotName, rawValue, parsedValue, confidence },
    ],
    isGreeting: false,
    isCancellation: false,
    isConfirmation: false,
    isCorrection: false,
  });
}

describe('AiParsingService — date hallucination detection', () => {
  it('should downgrade vague "в марте" with invented date to fuzzy period', async () => {
    const provider = createMockProvider(
      buildDateResponse('departureDate', 'в марте', '2026-03-15', 0.9),
    );
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('в марте', [], createEmptyDraft(), 'RU');

    expect(parseResult.extractedFields[0].parsedValue).toBe('March 2026');
    expect(parseResult.extractedFields[0].confidence).toBe(0.4);
  });

  it('should downgrade "mid march" with invented date to fuzzy period', async () => {
    const provider = createMockProvider(
      buildDateResponse('departureDate', 'mid march', '2026-03-15', 0.8),
    );
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('mid march', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe('March 2026');
    expect(parseResult.extractedFields[0].confidence).toBe(0.4);
  });

  it('should downgrade "примерно в марте" with invented date to fuzzy period', async () => {
    const provider = createMockProvider(
      buildDateResponse('departureDate', 'примерно в марте', '2026-03-10', 0.7),
    );
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('примерно в марте', [], createEmptyDraft(), 'RU');

    expect(parseResult.extractedFields[0].parsedValue).toBe('March 2026');
    expect(parseResult.extractedFields[0].confidence).toBe(0.4);
  });

  it('should downgrade "in March" for returnDate too', async () => {
    const provider = createMockProvider(
      buildDateResponse('returnDate', 'in March', '2026-03-22', 0.8),
    );
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('in March', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe('March 2026');
    expect(parseResult.extractedFields[0].confidence).toBe(0.4);
  });

  it('should preserve explicit date "March 15"', async () => {
    const provider = createMockProvider(
      buildDateResponse('departureDate', 'March 15', '2026-03-15', 0.9),
    );
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('March 15', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe('2026-03-15');
    expect(parseResult.extractedFields[0].confidence).toBe(0.9);
  });

  it('should preserve explicit date "10 марта"', async () => {
    const provider = createMockProvider(
      buildDateResponse('departureDate', '10 марта', '2026-03-10', 0.9),
    );
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('10 марта', [], createEmptyDraft(), 'RU');

    expect(parseResult.extractedFields[0].parsedValue).toBe('2026-03-10');
    expect(parseResult.extractedFields[0].confidence).toBe(0.9);
  });

  it('should preserve explicit date range "10-17 марта" (departure)', async () => {
    const provider = createMockProvider(
      buildDateResponse('departureDate', '10-17 марта', '2026-03-10', 0.9),
    );
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('10-17 марта', [], createEmptyDraft(), 'RU');

    expect(parseResult.extractedFields[0].parsedValue).toBe('2026-03-10');
    expect(parseResult.extractedFields[0].confidence).toBe(0.9);
  });

  it('should pass through already-fuzzy parsedValue like "March 2026"', async () => {
    const provider = createMockProvider(
      buildDateResponse('departureDate', 'в марте', 'March 2026', 0.4),
    );
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('в марте', [], createEmptyDraft(), 'RU');

    expect(parseResult.extractedFields[0].parsedValue).toBe('March 2026');
    expect(parseResult.extractedFields[0].confidence).toBe(0.4);
  });

  it('should not affect non-date fields', async () => {
    const response = JSON.stringify({
      extractedFields: [
        { slotName: 'destination', rawValue: 'Dubai', parsedValue: 'Dubai', confidence: 0.9 },
      ],
      isGreeting: false,
      isCancellation: false,
      isConfirmation: false,
      isCorrection: false,
    });
    const provider = createMockProvider(response);
    const service = new AiParsingService(provider);
    const { parseResult } = await service.parse('Dubai', [], createEmptyDraft(), 'EN');

    expect(parseResult.extractedFields[0].parsedValue).toBe('Dubai');
    expect(parseResult.extractedFields[0].confidence).toBe(0.9);
  });
});
