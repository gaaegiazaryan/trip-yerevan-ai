import { Currency } from '@prisma/client';

export enum OfferWizardStep {
  PRICE = 'PRICE',
  CURRENCY = 'CURRENCY',
  VALID_UNTIL = 'VALID_UNTIL',
  NOTE = 'NOTE',
  CONFIRM = 'CONFIRM',
}

export interface OfferWizardState {
  step: OfferWizardStep;
  travelRequestId: string;
  agencyId: string;
  agentId: string;
  priceTotal?: number;
  currency?: Currency;
  validUntil?: Date;
  note?: string;
}

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

export const ALLOWED_CURRENCIES: Currency[] = ['AMD', 'RUB', 'USD', 'EUR'];
export const MAX_NOTE_LENGTH = 500;
export const VALIDITY_OPTIONS = {
  '1d': 1,
  '3d': 3,
  '7d': 7,
} as const;
