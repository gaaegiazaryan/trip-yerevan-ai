/**
 * Regression tests for the "slot question repeat" bug.
 *
 * Bug: Bot keeps asking "Which city would you like to depart from?"
 * even after user provides a valid departure city.
 *
 * Root cause: Default draft has departureCity='Yerevan' at confidence 0.3.
 * SlotFillingService marks it PARTIAL (< 0.7 threshold). AI provider
 * didn't re-extract because value was already present in draft context.
 * Confidence stayed 0.3 → question repeated.
 */
import { DraftMergeService } from '../draft-merge.service';
import { SlotFillingService } from '../slot-filling.service';
import { ConversationStateService } from '../conversation-state.service';
import { createEmptyDraft, TravelDraft, ParseResult, ConversationState, SlotStatus } from '../../types';

describe('Slot repeat bug — departure city', () => {
  let mergeService: DraftMergeService;
  let slotService: SlotFillingService;
  let stateService: ConversationStateService;

  beforeEach(() => {
    mergeService = new DraftMergeService();
    slotService = new SlotFillingService();
    stateService = new ConversationStateService(slotService);
  });

  function buildParseResult(overrides: Partial<ParseResult> = {}): ParseResult {
    return {
      extractedFields: [],
      detectedLanguage: 'EN',
      overallConfidence: 0,
      suggestedQuestion: null,
      isGreeting: false,
      isCancellation: false,
      isConfirmation: false,
      isCorrection: false,
      rawAiResponse: '{}',
      ...overrides,
    };
  }

  function buildFilledDraft(): TravelDraft {
    const draft = createEmptyDraft();
    const now = new Date().toISOString();
    // Fill all required slots except departureCity
    draft.destination = { value: 'Paris', confidence: 0.9, source: 'user_explicit', updatedAt: now };
    draft.departureDate = { value: '2026-04-15', confidence: 0.9, source: 'user_explicit', updatedAt: now };
    draft.adults = { value: 2, confidence: 0.9, source: 'user_explicit', updatedAt: now };
    draft.tripType = { value: 'PACKAGE_TOUR', confidence: 0.9, source: 'user_explicit', updatedAt: now };
    return draft;
  }

  describe('default draft state', () => {
    it('departureCity should be PARTIAL in a fresh draft', () => {
      const draft = createEmptyDraft();
      const slots = slotService.evaluateSlots(draft);
      const dcSlot = slots.find((s) => s.name === 'departureCity');
      expect(dcSlot?.status).toBe(SlotStatus.PARTIAL);
    });

    it('departureCity should appear in missing required slots', () => {
      const draft = buildFilledDraft();
      const missing = slotService.getMissingRequired(draft);
      expect(missing.map((s) => s.name)).toContain('departureCity');
    });
  });

  describe('merge upgrades confidence when AI re-extracts', () => {
    it('should upgrade departureCity from 0.3 to 0.9 when user confirms "Yerevan"', () => {
      const draft = buildFilledDraft();
      expect(draft.departureCity.confidence).toBe(0.3);

      const parseResult = buildParseResult({
        extractedFields: [{
          slotName: 'departureCity',
          rawValue: 'Yerevan',
          parsedValue: 'Yerevan',
          confidence: 0.9,
        }],
      });

      const merged = mergeService.merge(draft, parseResult);
      expect(merged.departureCity.value).toBe('Yerevan');
      expect(merged.departureCity.confidence).toBe(0.9);
      expect(merged.departureCity.source).toBe('user_explicit');
    });

    it('should mark departureCity as FILLED after confidence upgrade', () => {
      const draft = buildFilledDraft();
      const parseResult = buildParseResult({
        extractedFields: [{
          slotName: 'departureCity',
          rawValue: 'Erevan',
          parsedValue: 'Yerevan',
          confidence: 0.9,
        }],
      });

      const merged = mergeService.merge(draft, parseResult);
      const slots = slotService.evaluateSlots(merged);
      const dcSlot = slots.find((s) => s.name === 'departureCity');
      expect(dcSlot?.status).toBe(SlotStatus.FILLED);
    });

    it('should NOT have departureCity in missing required after merge', () => {
      const draft = buildFilledDraft();
      const parseResult = buildParseResult({
        extractedFields: [{
          slotName: 'departureCity',
          rawValue: 'Moscow',
          parsedValue: 'Moscow',
          confidence: 0.9,
        }],
      });

      const merged = mergeService.merge(draft, parseResult);
      const missing = slotService.getMissingRequired(merged);
      expect(missing.map((s) => s.name)).not.toContain('departureCity');
    });
  });

  describe('state machine advances after all required slots filled', () => {
    it('should transition to CONFIRMING_DRAFT when all required slots are filled', () => {
      const draft = buildFilledDraft();
      const parseResult = buildParseResult({
        extractedFields: [{
          slotName: 'departureCity',
          rawValue: 'Yerevan',
          parsedValue: 'Yerevan',
          confidence: 0.9,
        }],
      });

      const merged = mergeService.merge(draft, parseResult);
      expect(slotService.isComplete(merged)).toBe(true);

      const newState = stateService.transition(
        ConversationState.COLLECTING_DETAILS,
        merged,
        parseResult,
      );
      expect(newState).toBe(ConversationState.CONFIRMING_DRAFT);
    });

    it('should NOT advance if departureCity stays PARTIAL (no extraction)', () => {
      const draft = buildFilledDraft();
      const emptyParse = buildParseResult();

      const merged = mergeService.merge(draft, emptyParse);
      // departureCity stays at 0.3 confidence → still PARTIAL
      expect(merged.departureCity.confidence).toBe(0.3);
      expect(slotService.isComplete(merged)).toBe(false);

      const newState = stateService.transition(
        ConversationState.COLLECTING_DETAILS,
        merged,
        emptyParse,
      );
      expect(newState).toBe(ConversationState.COLLECTING_DETAILS);
    });
  });

  describe('multilingual departure city extraction', () => {
    it('should accept city in Russian', () => {
      const draft = buildFilledDraft();
      const parseResult = buildParseResult({
        extractedFields: [{
          slotName: 'departureCity',
          rawValue: 'Ереван',
          parsedValue: 'Yerevan',
          confidence: 0.9,
        }],
      });

      const merged = mergeService.merge(draft, parseResult);
      expect(merged.departureCity.value).toBe('Yerevan');
      expect(merged.departureCity.confidence).toBe(0.9);
    });

    it('should accept a different city overriding the default', () => {
      const draft = buildFilledDraft();
      const parseResult = buildParseResult({
        extractedFields: [{
          slotName: 'departureCity',
          rawValue: 'Moscow',
          parsedValue: 'Moscow',
          confidence: 0.9,
        }],
      });

      const merged = mergeService.merge(draft, parseResult);
      expect(merged.departureCity.value).toBe('Moscow');
      expect(merged.departureCity.confidence).toBe(0.9);
    });
  });
});
