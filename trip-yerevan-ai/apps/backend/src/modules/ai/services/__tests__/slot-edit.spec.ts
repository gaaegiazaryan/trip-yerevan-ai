/**
 * Tests for the slot editing flow.
 * Verifies: SlotEditDetectionService detection, draft slot clearing,
 * and the full edit flow (field callback → cleared slots → question asked).
 */
import { SlotEditDetectionService } from '../slot-edit-detection.service';
import { ResponseGeneratorService } from '../response-generator.service';
import { ClarificationService } from '../clarification.service';
import { SlotFillingService } from '../slot-filling.service';
import { LanguageService } from '../language.service';
import {
  ConversationState,
  ParseResult,
  TravelDraft,
  createEmptyDraft,
  TravelDraftField,
} from '../../types';

function createFilledDraft(): TravelDraft {
  const now = new Date().toISOString();
  const filled = <T>(value: T): TravelDraftField<T> => ({
    value,
    confidence: 0.9,
    source: 'user_explicit',
    updatedAt: now,
  });

  return {
    ...createEmptyDraft(),
    destination: filled('Egypt'),
    departureCity: filled('Yerevan'),
    departureDate: filled('2026-03-15'),
    returnDate: filled('2026-03-22'),
    adults: filled(2),
    tripType: filled('PACKAGE_TOUR'),
    version: 5,
  };
}

function createEmptyParseResult(): ParseResult {
  return {
    extractedFields: [],
    detectedLanguage: 'RU',
    overallConfidence: 0,
    suggestedQuestion: null,
    isGreeting: false,
    isCancellation: false,
    isConfirmation: false,
    isCorrection: false,
    rawAiResponse: '[slot-edit]',
  };
}

// ── SlotEditDetectionService ──────────────────────────────────────────────

describe('SlotEditDetectionService', () => {
  let service: SlotEditDetectionService;

  beforeEach(() => {
    service = new SlotEditDetectionService();
  });

  it('should detect by exact group key', () => {
    const result = service.detect('dates');
    expect(result).not.toBeNull();
    expect(result!.group.key).toBe('dates');
    expect(result!.slots).toEqual(['departureDate', 'returnDate']);
  });

  it('should detect by Russian synonym', () => {
    const result = service.detect('даты');
    expect(result).not.toBeNull();
    expect(result!.group.key).toBe('dates');
  });

  it('should detect by partial match', () => {
    const result = service.detect('дату вылета');
    expect(result).not.toBeNull();
    expect(result!.group.key).toBe('dates');
  });

  it('should detect destination', () => {
    const result = service.detect('направление');
    expect(result).not.toBeNull();
    expect(result!.group.key).toBe('destination');
    expect(result!.slots).toEqual(['destination']);
  });

  it('should detect budget by Russian synonym', () => {
    const result = service.detect('бюджет');
    expect(result).not.toBeNull();
    expect(result!.group.key).toBe('budget');
    expect(result!.slots).toEqual(['budgetMin', 'budgetMax', 'currency']);
  });

  it('should detect travelers', () => {
    const result = service.detect('travelers');
    expect(result).not.toBeNull();
    expect(result!.group.key).toBe('travelers');
    expect(result!.slots).toContain('adults');
    expect(result!.slots).toContain('children');
  });

  it('should detect trip type', () => {
    const result = service.detect('тип поездки');
    expect(result).not.toBeNull();
    expect(result!.group.key).toBe('tripType');
  });

  it('should return null for unrecognized input', () => {
    const result = service.detect('something random xyz');
    expect(result).toBeNull();
  });

  it('should return null for empty input', () => {
    expect(service.detect('')).toBeNull();
    expect(service.detect('  ')).toBeNull();
  });

  it('should be case-insensitive', () => {
    const result = service.detect('DATES');
    expect(result).not.toBeNull();
    expect(result!.group.key).toBe('dates');
  });

  it('should return all editable groups', () => {
    const groups = service.getEditableGroups();
    expect(groups.length).toBe(7);
    const keys = groups.map((g) => g.key);
    expect(keys).toEqual([
      'destination', 'dates', 'departureCity', 'travelers',
      'tripType', 'budget', 'notes',
    ]);
    // Ensure synonyms are NOT exposed
    for (const g of groups) {
      expect(g).not.toHaveProperty('synonyms');
    }
  });
});

// ── Slot clearing in ResponseGenerator ────────────────────────────────────

describe('ResponseGeneratorService — Slot edit flow', () => {
  let service: ResponseGeneratorService;

  beforeEach(() => {
    const slotFilling = new SlotFillingService();
    const language = new LanguageService();
    const clarification = new ClarificationService(slotFilling, language);
    const slotEditDetection = new SlotEditDetectionService();
    service = new ResponseGeneratorService(clarification, slotFilling, language, slotEditDetection);
  });

  it('should ask about destination when destination slot is cleared', () => {
    const draft = createFilledDraft();
    // Simulate cleared destination
    draft.destination = { value: null, confidence: 0, source: 'default', updatedAt: new Date().toISOString() };
    const parseResult = createEmptyParseResult();

    const response = service.generate(
      'conv-123',
      ConversationState.COLLECTING_DETAILS,
      draft,
      parseResult,
      'RU',
    );

    expect(response.textResponse.length).toBeGreaterThan(0);
    expect(response.state).toBe(ConversationState.COLLECTING_DETAILS);
    // Should NOT show correction_prompt (slot was cleared, question should be asked)
    expect(response.textResponse).not.toBe('Понял, что именно вы хотите изменить?');
  });

  it('should ask about dates when date slots are cleared', () => {
    const draft = createFilledDraft();
    // Simulate cleared dates
    const cleared = { value: null, confidence: 0, source: 'default' as const, updatedAt: new Date().toISOString() };
    draft.departureDate = cleared;
    draft.returnDate = cleared;
    const parseResult = createEmptyParseResult();

    const response = service.generate(
      'conv-123',
      ConversationState.COLLECTING_DETAILS,
      draft,
      parseResult,
      'RU',
    );

    expect(response.textResponse.length).toBeGreaterThan(0);
    expect(response.state).toBe(ConversationState.COLLECTING_DETAILS);
  });

  it('should show only cancel button after slot cleared (not field selection)', () => {
    const draft = createFilledDraft();
    draft.destination = { value: null, confidence: 0, source: 'default', updatedAt: new Date().toISOString() };
    const parseResult = createEmptyParseResult(); // isCorrection = false

    const response = service.generate(
      'conv-123',
      ConversationState.COLLECTING_DETAILS,
      draft,
      parseResult,
      'RU',
    );

    expect(response.suggestedActions).toHaveLength(1);
    expect(response.suggestedActions[0].type).toBe('cancel');
  });

  it('should show field selection buttons in EN when isCorrection', () => {
    const draft = createFilledDraft();
    const parseResult: ParseResult = {
      ...createEmptyParseResult(),
      isCorrection: true,
    };

    const response = service.generate(
      'conv-123',
      ConversationState.COLLECTING_DETAILS,
      draft,
      parseResult,
      'EN',
    );

    const fieldActions = response.suggestedActions.filter((a) => a.type === 'edit_field');
    expect(fieldActions.length).toBe(7);
    expect(fieldActions[0].label).toBe('Destination');
    expect(fieldActions[1].label).toBe('Dates');
  });
});
