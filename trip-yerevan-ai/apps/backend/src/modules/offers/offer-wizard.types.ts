import {
  Currency,
  HotelStars,
  MealPlan,
  FlightClass,
  TransferType,
  AttachmentType,
} from '@prisma/client';

// =============================================================================
// Wizard sections (top-level flow)
// =============================================================================

export enum OfferWizardSection {
  PRICE = 'PRICE',
  HOTEL = 'HOTEL',
  FLIGHT = 'FLIGHT',
  TRANSFER = 'TRANSFER',
  TRAVEL_DETAILS = 'TRAVEL_DETAILS',
  VALIDITY = 'VALIDITY',
  ATTACHMENTS = 'ATTACHMENTS',
  CONFIRM = 'CONFIRM',
}

// =============================================================================
// Sub-steps within each section
// =============================================================================

export enum PriceStep {
  TOTAL_PRICE = 'TOTAL_PRICE',
  CURRENCY = 'CURRENCY',
  INCLUDES = 'INCLUDES',
  EXCLUDES = 'EXCLUDES',
}

export enum HotelStep {
  HOTEL_NAME = 'HOTEL_NAME',
  HOTEL_STARS = 'HOTEL_STARS',
  ROOM_TYPE = 'ROOM_TYPE',
  MEAL_PLAN = 'MEAL_PLAN',
  HOTEL_LOCATION = 'HOTEL_LOCATION',
  HOTEL_DESCRIPTION = 'HOTEL_DESCRIPTION',
}

export enum FlightStep {
  AIRLINE = 'AIRLINE',
  DEPARTURE_FLIGHT = 'DEPARTURE_FLIGHT',
  RETURN_FLIGHT = 'RETURN_FLIGHT',
  BAGGAGE = 'BAGGAGE',
  FLIGHT_CLASS = 'FLIGHT_CLASS',
}

export enum TransferStep {
  TRANSFER_INCLUDED = 'TRANSFER_INCLUDED',
  TRANSFER_TYPE = 'TRANSFER_TYPE',
}

export enum TravelDetailsStep {
  DEPARTURE_DATE = 'DEPARTURE_DATE',
  RETURN_DATE = 'RETURN_DATE',
  NIGHTS_COUNT = 'NIGHTS_COUNT',
  ADULTS = 'ADULTS',
  CHILDREN = 'CHILDREN',
  INSURANCE = 'INSURANCE',
}

export enum ValidityStep {
  VALID_UNTIL = 'VALID_UNTIL',
}

export enum AttachmentsStep {
  UPLOAD = 'UPLOAD',
}

export type WizardSubStep =
  | PriceStep
  | HotelStep
  | FlightStep
  | TransferStep
  | TravelDetailsStep
  | ValidityStep
  | AttachmentsStep;

// =============================================================================
// Ordered sub-step arrays (for navigation)
// =============================================================================

export const PRICE_STEPS: PriceStep[] = [
  PriceStep.TOTAL_PRICE,
  PriceStep.CURRENCY,
  PriceStep.INCLUDES,
  PriceStep.EXCLUDES,
];

export const HOTEL_STEPS: HotelStep[] = [
  HotelStep.HOTEL_NAME,
  HotelStep.HOTEL_STARS,
  HotelStep.ROOM_TYPE,
  HotelStep.MEAL_PLAN,
  HotelStep.HOTEL_LOCATION,
  HotelStep.HOTEL_DESCRIPTION,
];

export const FLIGHT_STEPS: FlightStep[] = [
  FlightStep.AIRLINE,
  FlightStep.DEPARTURE_FLIGHT,
  FlightStep.RETURN_FLIGHT,
  FlightStep.BAGGAGE,
  FlightStep.FLIGHT_CLASS,
];

export const TRANSFER_STEPS: TransferStep[] = [
  TransferStep.TRANSFER_INCLUDED,
  TransferStep.TRANSFER_TYPE,
];

export const TRAVEL_DETAILS_STEPS: TravelDetailsStep[] = [
  TravelDetailsStep.DEPARTURE_DATE,
  TravelDetailsStep.RETURN_DATE,
  TravelDetailsStep.NIGHTS_COUNT,
  TravelDetailsStep.ADULTS,
  TravelDetailsStep.CHILDREN,
  TravelDetailsStep.INSURANCE,
];

export const VALIDITY_STEPS: ValidityStep[] = [ValidityStep.VALID_UNTIL];

export const ATTACHMENTS_STEPS: AttachmentsStep[] = [AttachmentsStep.UPLOAD];

/** Ordered section flow (CONFIRM is not skippable) */
export const SECTION_ORDER: OfferWizardSection[] = [
  OfferWizardSection.PRICE,
  OfferWizardSection.HOTEL,
  OfferWizardSection.FLIGHT,
  OfferWizardSection.TRANSFER,
  OfferWizardSection.TRAVEL_DETAILS,
  OfferWizardSection.VALIDITY,
  OfferWizardSection.ATTACHMENTS,
  OfferWizardSection.CONFIRM,
];

/** Sections that can be skipped */
export const SKIPPABLE_SECTIONS = new Set<OfferWizardSection>([
  OfferWizardSection.HOTEL,
  OfferWizardSection.FLIGHT,
  OfferWizardSection.TRANSFER,
  OfferWizardSection.TRAVEL_DETAILS,
  OfferWizardSection.ATTACHMENTS,
]);

// =============================================================================
// Draft attachment (in-memory before DB persist)
// =============================================================================

export interface DraftAttachment {
  type: AttachmentType;
  telegramFileId: string;
  fileName?: string;
  mimeType?: string;
}

// =============================================================================
// Wizard draft (in-memory state)
// =============================================================================

export interface OfferDraft {
  // Price (required)
  totalPrice?: number;
  currency?: Currency;
  includes: string[];
  excludes: string[];

  // Hotel (optional section)
  hotelName?: string;
  hotelStars?: HotelStars;
  roomType?: string;
  mealPlan?: MealPlan;
  hotelLocation?: string;
  hotelDescription?: string;

  // Flight (optional section)
  airline?: string;
  departureFlightNumber?: string;
  returnFlightNumber?: string;
  baggageIncluded?: boolean;
  flightClass?: FlightClass;

  // Transfer (optional section)
  transferIncluded?: boolean;
  transferType?: TransferType;

  // Travel details (optional section)
  departureDate?: string; // YYYY-MM-DD
  returnDate?: string;    // YYYY-MM-DD
  nightsCount?: number;
  adults?: number;
  children?: number;
  insuranceIncluded?: boolean;

  // Validity (required)
  validUntil?: Date;

  // Attachments
  attachments: DraftAttachment[];
}

// =============================================================================
// Wizard state (per chat)
// =============================================================================

export interface OfferWizardState {
  section: OfferWizardSection;
  subStep: WizardSubStep;
  travelRequestId: string;
  agencyId: string;
  membershipId: string;
  draft: OfferDraft;

  /** When editing from CONFIRM, return to CONFIRM after section completes */
  editingFromConfirm?: boolean;

  /** Collecting list items one-by-one (for includes/excludes) */
  collectingList?: 'includes' | 'excludes';
}

// =============================================================================
// Result types
// =============================================================================

export interface WizardStepResult {
  text: string;
  buttons?: { label: string; callbackData: string }[];
}

export interface OfferSubmitResult extends WizardStepResult {
  offerId: string;
  travelerTelegramId: bigint;
  travelRequestId: string;
}

export function isOfferSubmitResult(
  result: WizardStepResult,
): result is OfferSubmitResult {
  return 'offerId' in result;
}

// =============================================================================
// Constants
// =============================================================================

export const ALLOWED_CURRENCIES: Currency[] = ['AMD', 'RUB', 'USD', 'EUR'];

export const HOTEL_STARS_OPTIONS: { label: string; value: HotelStars }[] = [
  { label: '1\u2b50', value: 'ONE' },
  { label: '2\u2b50', value: 'TWO' },
  { label: '3\u2b50', value: 'THREE' },
  { label: '4\u2b50', value: 'FOUR' },
  { label: '5\u2b50', value: 'FIVE' },
];

export const MEAL_PLAN_OPTIONS: { label: string; value: MealPlan }[] = [
  { label: 'RO (Room Only)', value: 'RO' },
  { label: 'BB (Bed & Breakfast)', value: 'BB' },
  { label: 'HB (Half Board)', value: 'HB' },
  { label: 'FB (Full Board)', value: 'FB' },
  { label: 'AI (All Inclusive)', value: 'AI' },
  { label: 'UAI (Ultra AI)', value: 'UAI' },
];

export const FLIGHT_CLASS_OPTIONS: { label: string; value: FlightClass }[] = [
  { label: 'Economy', value: 'ECONOMY' },
  { label: 'Business', value: 'BUSINESS' },
];

export const TRANSFER_TYPE_OPTIONS: { label: string; value: TransferType }[] = [
  { label: 'Group', value: 'GROUP' },
  { label: 'Private', value: 'PRIVATE' },
  { label: 'VIP', value: 'VIP' },
];

export const VALIDITY_OPTIONS = {
  '1d': 1,
  '3d': 3,
  '7d': 7,
} as const;

export const MAX_NOTE_LENGTH = 500;
export const MAX_LIST_ITEMS = 20;
export const MAX_LIST_ITEM_LENGTH = 100;
export const MAX_ATTACHMENTS = 10;
export const MAX_HOTEL_DESCRIPTION_LENGTH = 500;
export const MAX_HOTEL_NAME_LENGTH = 200;
export const MAX_AIRLINE_LENGTH = 100;
export const MAX_FLIGHT_NUMBER_LENGTH = 20;

export function createEmptyDraft(): OfferDraft {
  return {
    includes: [],
    excludes: [],
    attachments: [],
  };
}
