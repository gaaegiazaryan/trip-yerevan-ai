export enum AgencyWizardStep {
  NAME = 'NAME',
  PHONE = 'PHONE',
  SPECIALIZATIONS = 'SPECIALIZATIONS',
  COUNTRIES = 'COUNTRIES',
  CONFIRM = 'CONFIRM',
}

export interface AgencyWizardState {
  step: AgencyWizardStep;
  telegramId: bigint;
  name?: string;
  phone?: string;
  specializations: string[];
  countries: string[];
}

export interface WizardStepResult {
  text: string;
  buttons?: { label: string; callbackData: string }[];
}

export const SPECIALIZATION_OPTIONS = [
  'PACKAGE',
  'FLIGHT_ONLY',
  'HOTEL_ONLY',
  'EXCURSION',
  'CUSTOM',
] as const;

export const SPECIALIZATION_LABELS: Record<string, string> = {
  PACKAGE: 'Package tours',
  FLIGHT_ONLY: 'Flights',
  HOTEL_ONLY: 'Hotels',
  EXCURSION: 'Excursions',
  CUSTOM: 'Custom trips',
};

export const COUNTRY_OPTIONS = [
  'Armenia',
  'Georgia',
  'Turkey',
  'Egypt',
  'UAE',
  'Thailand',
  'Maldives',
  'Russia',
  'Europe',
] as const;

export const PHONE_REGEX = /^\+?\d{7,15}$/;
