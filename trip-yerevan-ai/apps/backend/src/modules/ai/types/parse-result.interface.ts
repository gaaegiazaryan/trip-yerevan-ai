import { SlotName } from './slot.interface';
import { SupportedLanguage } from './language.types';

export interface ExtractedField {
  slotName: SlotName;
  rawValue: string;
  parsedValue: unknown;
  confidence: number;
}

export interface ParseResult {
  extractedFields: ExtractedField[];
  detectedLanguage: SupportedLanguage;
  overallConfidence: number;
  suggestedQuestion: string | null;
  isGreeting: boolean;
  isCancellation: boolean;
  isConfirmation: boolean;
  isCorrection: boolean;
  rawAiResponse: string;
}
