import {
  MAX_LIST_ITEMS,
  MAX_LIST_ITEM_LENGTH,
  MAX_HOTEL_DESCRIPTION_LENGTH,
  MAX_HOTEL_NAME_LENGTH,
  MAX_AIRLINE_LENGTH,
  MAX_FLIGHT_NUMBER_LENGTH,
} from './offer-wizard.types';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const OK: ValidationResult = { valid: true };

export function validatePrice(text: string): ValidationResult {
  const cleaned = text.replace(/[,\s]/g, '');
  const price = Number(cleaned);

  if (isNaN(price) || price <= 0) {
    return {
      valid: false,
      error: 'Please enter a valid positive number for the price.\n\nExample: `1500` or `2,500`',
    };
  }

  if (price > 999_999_999) {
    return { valid: false, error: 'Price is too large. Please enter a realistic amount.' };
  }

  return OK;
}

export function parsePrice(text: string): number {
  return Number(text.replace(/[,\s]/g, ''));
}

export function validateFutureDate(text: string): ValidationResult {
  const trimmed = text.trim();
  const parsed = new Date(trimmed);

  if (isNaN(parsed.getTime())) {
    return {
      valid: false,
      error: 'Invalid date format. Please enter a date as YYYY-MM-DD.',
    };
  }

  parsed.setHours(23, 59, 59, 999);

  if (parsed.getTime() <= Date.now()) {
    return { valid: false, error: 'Date must be in the future.' };
  }

  return OK;
}

export function validateDate(text: string): ValidationResult {
  const trimmed = text.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { valid: false, error: 'Please enter a date as YYYY-MM-DD.' };
  }

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) {
    return { valid: false, error: 'Invalid date. Please enter a valid date as YYYY-MM-DD.' };
  }

  return OK;
}

export function validateDatePair(
  departure: string,
  returnDateText: string,
): ValidationResult {
  const result = validateDate(returnDateText);
  if (!result.valid) return result;

  const dep = new Date(departure);
  const ret = new Date(returnDateText.trim());

  if (ret < dep) {
    return { valid: false, error: 'Return date must be on or after the departure date.' };
  }

  return OK;
}

export function validatePositiveInt(
  text: string,
  min: number,
  max: number,
  fieldName: string,
): ValidationResult {
  const trimmed = text.trim();
  const num = Number(trimmed);

  if (!Number.isInteger(num)) {
    return { valid: false, error: `Please enter a whole number for ${fieldName}.` };
  }

  if (num < min || num > max) {
    return { valid: false, error: `${fieldName} must be between ${min} and ${max}.` };
  }

  return OK;
}

export function validateListItem(text: string): ValidationResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Item cannot be empty.' };
  }
  if (trimmed.length > MAX_LIST_ITEM_LENGTH) {
    return {
      valid: false,
      error: `Item is too long (${trimmed.length}/${MAX_LIST_ITEM_LENGTH} chars).`,
    };
  }
  return OK;
}

export function validateListSize(currentCount: number): ValidationResult {
  if (currentCount >= MAX_LIST_ITEMS) {
    return { valid: false, error: `Maximum ${MAX_LIST_ITEMS} items allowed.` };
  }
  return OK;
}

/** Parse comma-separated or single items from user text */
export function parseListItems(text: string): string[] {
  if (text.includes(',')) {
    return text
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? [trimmed] : [];
}

export function validateHotelName(text: string): ValidationResult {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_HOTEL_NAME_LENGTH) {
    return {
      valid: false,
      error: `Hotel name must be 1-${MAX_HOTEL_NAME_LENGTH} characters.`,
    };
  }
  return OK;
}

export function validateHotelDescription(text: string): ValidationResult {
  const trimmed = text.trim();
  if (trimmed.length > MAX_HOTEL_DESCRIPTION_LENGTH) {
    return {
      valid: false,
      error: `Description is too long (${trimmed.length}/${MAX_HOTEL_DESCRIPTION_LENGTH} chars).`,
    };
  }
  return OK;
}

export function validateAirline(text: string): ValidationResult {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_AIRLINE_LENGTH) {
    return {
      valid: false,
      error: `Airline name must be 1-${MAX_AIRLINE_LENGTH} characters.`,
    };
  }
  return OK;
}

export function validateFlightNumber(text: string): ValidationResult {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_FLIGHT_NUMBER_LENGTH) {
    return {
      valid: false,
      error: `Flight number must be 1-${MAX_FLIGHT_NUMBER_LENGTH} characters.`,
    };
  }
  return OK;
}

export function validateStringLength(
  text: string,
  maxLen: number,
  fieldName: string,
): ValidationResult {
  const trimmed = text.trim();
  if (trimmed.length > maxLen) {
    return {
      valid: false,
      error: `${fieldName} is too long (${trimmed.length}/${maxLen} chars).`,
    };
  }
  return OK;
}
