export type DraftFieldSource = 'user_explicit' | 'ai_inferred' | 'default';

export interface TravelDraftField<T> {
  value: T | null;
  confidence: number;
  source: DraftFieldSource;
  updatedAt: string;
}

export interface TravelDraft {
  version: number;
  destination: TravelDraftField<string>;
  departureCity: TravelDraftField<string>;
  departureDate: TravelDraftField<string>;
  returnDate: TravelDraftField<string>;
  tripType: TravelDraftField<string>;
  adults: TravelDraftField<number>;
  children: TravelDraftField<number>;
  childrenAges: TravelDraftField<number[]>;
  infants: TravelDraftField<number>;
  budgetMin: TravelDraftField<number>;
  budgetMax: TravelDraftField<number>;
  currency: TravelDraftField<string>;
  preferences: TravelDraftField<string[]>;
  notes: TravelDraftField<string>;
}

export function createEmptyDraft(): TravelDraft {
  const now = new Date().toISOString();
  const empty = <T>(value: T | null = null, confidence = 0): TravelDraftField<T> => ({
    value,
    confidence,
    source: 'default',
    updatedAt: now,
  });

  return {
    version: 0,
    destination: empty<string>(),
    departureCity: empty<string>('Yerevan', 0.3),
    departureDate: empty<string>(),
    returnDate: empty<string>(),
    tripType: empty<string>(),
    adults: empty<number>(1, 0.3),
    children: empty<number>(0, 0.3),
    childrenAges: empty<number[]>(),
    infants: empty<number>(0, 0.3),
    budgetMin: empty<number>(),
    budgetMax: empty<number>(),
    currency: empty<string>('USD', 0.3),
    preferences: empty<string[]>(),
    notes: empty<string>(),
  };
}
