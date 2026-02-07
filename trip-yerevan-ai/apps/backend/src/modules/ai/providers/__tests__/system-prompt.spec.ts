import { buildSystemPrompt } from '../system-prompt';
import { createEmptyDraft } from '../../types/travel-draft.interface';

describe('buildSystemPrompt', () => {
  it('should contain all slot names', () => {
    const prompt = buildSystemPrompt(createEmptyDraft(), 'EN');
    const slots = [
      'destination', 'departureCity', 'departureDate', 'returnDate',
      'tripType', 'adults', 'children', 'childrenAges', 'infants',
      'budgetMin', 'budgetMax', 'currency', 'preferences', 'notes',
    ];
    for (const slot of slots) {
      expect(prompt).toContain(`"${slot}"`);
    }
  });

  it('should include current draft values with status markers', () => {
    const draft = createEmptyDraft();
    draft.destination = {
      value: 'Paris',
      confidence: 0.9,
      source: 'user_explicit',
      updatedAt: new Date().toISOString(),
    };
    const prompt = buildSystemPrompt(draft, 'EN');
    expect(prompt).toContain('Paris');
    expect(prompt).toContain('[CONFIRMED]');
    // Low-confidence defaults should be marked UNCONFIRMED
    expect(prompt).toContain('[UNCONFIRMED');
  });

  it('should include language label for RU', () => {
    const prompt = buildSystemPrompt(createEmptyDraft(), 'RU');
    expect(prompt).toContain('Russian');
  });

  it('should include language label for AM', () => {
    const prompt = buildSystemPrompt(createEmptyDraft(), 'AM');
    expect(prompt).toContain('Armenian');
  });

  it('should include today date for relative date resolution', () => {
    const today = new Date().toISOString().split('T')[0];
    const prompt = buildSystemPrompt(createEmptyDraft(), 'EN');
    expect(prompt).toContain(today);
  });

  it('should enforce JSON-only output', () => {
    const prompt = buildSystemPrompt(createEmptyDraft(), 'EN');
    expect(prompt).toContain('ONLY valid JSON');
  });

  it('should list intent detection rules', () => {
    const prompt = buildSystemPrompt(createEmptyDraft(), 'EN');
    expect(prompt).toContain('isGreeting');
    expect(prompt).toContain('isCancellation');
    expect(prompt).toContain('isConfirmation');
    expect(prompt).toContain('isCorrection');
  });

  it('should show unfilled slots as not yet provided', () => {
    const prompt = buildSystemPrompt(createEmptyDraft(), 'EN');
    expect(prompt).toContain('[not yet provided]');
  });

  it('should list tripType enum values', () => {
    const prompt = buildSystemPrompt(createEmptyDraft(), 'EN');
    expect(prompt).toContain('PACKAGE_TOUR');
    expect(prompt).toContain('FLIGHT_ONLY');
    expect(prompt).toContain('HOTEL_ONLY');
    expect(prompt).toContain('EXCURSION');
  });
});
