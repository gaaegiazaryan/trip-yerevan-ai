/**
 * Tests for the Edit button (correction) flow.
 * Ensures pressing Edit returns the correction prompt (not empty text)
 * and correctly transitions to COLLECTING_DETAILS state.
 */
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
    adults: filled(2),
    tripType: filled('PACKAGE_TOUR'),
    version: 5,
  };
}

function createCorrectionParseResult(): ParseResult {
  return {
    extractedFields: [],
    detectedLanguage: 'RU',
    overallConfidence: 1.0,
    suggestedQuestion: null,
    isGreeting: false,
    isCancellation: false,
    isConfirmation: false,
    isCorrection: true,
    rawAiResponse: '[synthetic:__EDIT__edit]',
  };
}

function createNormalParseResult(): ParseResult {
  return {
    extractedFields: [],
    detectedLanguage: 'EN',
    overallConfidence: 0.5,
    suggestedQuestion: null,
    isGreeting: false,
    isCancellation: false,
    isConfirmation: false,
    isCorrection: false,
    rawAiResponse: '{}',
  };
}

describe('ResponseGeneratorService — Edit button flow', () => {
  let service: ResponseGeneratorService;

  beforeEach(() => {
    const slotFilling = new SlotFillingService();
    const language = new LanguageService();
    const clarification = new ClarificationService(slotFilling, language);
    service = new ResponseGeneratorService(clarification, slotFilling, language);
  });

  it('should return correction_prompt when isCorrection in COLLECTING_DETAILS', () => {
    const draft = createFilledDraft();
    const parseResult = createCorrectionParseResult();

    const response = service.generate(
      'conv-123',
      ConversationState.COLLECTING_DETAILS,
      draft,
      parseResult,
      'RU',
    );

    expect(response.textResponse).toBe('Понял, что именно вы хотите изменить?');
    expect(response.state).toBe(ConversationState.COLLECTING_DETAILS);
    expect(response.textResponse.length).toBeGreaterThan(0);
  });

  it('should return English correction_prompt for EN language', () => {
    const draft = createFilledDraft();
    const parseResult = createCorrectionParseResult();

    const response = service.generate(
      'conv-123',
      ConversationState.COLLECTING_DETAILS,
      draft,
      parseResult,
      'EN',
    );

    expect(response.textResponse).toBe('Got it, what would you like to change?');
  });

  it('should return cancel action in COLLECTING_DETAILS state', () => {
    const draft = createFilledDraft();
    const parseResult = createCorrectionParseResult();

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

  it('should NOT return empty text when all slots filled and no correction', () => {
    const draft = createFilledDraft();
    const parseResult = createNormalParseResult();

    const response = service.generate(
      'conv-123',
      ConversationState.COLLECTING_DETAILS,
      draft,
      parseResult,
      'RU',
    );

    // Even without isCorrection, should fall back to correction_prompt
    // rather than returning empty string
    expect(response.textResponse.length).toBeGreaterThan(0);
  });

  it('should return summary with actions in CONFIRMING_DRAFT state', () => {
    const draft = createFilledDraft();
    const parseResult = createNormalParseResult();

    const response = service.generate(
      'conv-123',
      ConversationState.CONFIRMING_DRAFT,
      draft,
      parseResult,
      'RU',
    );

    expect(response.suggestedActions).toHaveLength(3);
    expect(response.suggestedActions.map((a) => a.type)).toEqual([
      'confirm',
      'edit_field',
      'cancel',
    ]);
    expect(response.textResponse.length).toBeGreaterThan(0);
  });
});
