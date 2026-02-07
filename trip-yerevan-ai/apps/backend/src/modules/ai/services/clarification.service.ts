import { Injectable } from '@nestjs/common';
import {
  TravelDraft,
  SlotDefinition,
  SlotName,
  SupportedLanguage,
  TemplateKey,
} from '../types';
import { SlotFillingService } from './slot-filling.service';
import { LanguageService } from './language.service';

const SLOT_TO_TEMPLATE: Partial<Record<SlotName, TemplateKey>> = {
  destination: 'ask_destination',
  departureDate: 'ask_dates',
  returnDate: 'ask_dates',
  adults: 'ask_travelers',
  children: 'ask_travelers',
  infants: 'ask_travelers',
  childrenAges: 'ask_children_ages',
  budgetMin: 'ask_budget',
  budgetMax: 'ask_budget',
  currency: 'ask_budget',
  preferences: 'ask_preferences',
  departureCity: 'ask_departure_city',
  tripType: 'ask_trip_type',
};

@Injectable()
export class ClarificationService {
  constructor(
    private readonly slotFilling: SlotFillingService,
    private readonly language: LanguageService,
  ) {}

  generateQuestion(
    draft: TravelDraft,
    lang: SupportedLanguage,
  ): string {
    const nextSlot = this.slotFilling.getNextSlotToAsk(draft);
    if (!nextSlot) return '';

    const templateKey = SLOT_TO_TEMPLATE[nextSlot.name];
    if (!templateKey) return '';

    return this.language.getTemplate(templateKey, lang);
  }

  generateSummary(draft: TravelDraft, lang: SupportedLanguage): string {
    const lines: string[] = [];

    if (draft.destination.value) lines.push(`Destination: ${draft.destination.value}`);
    if (draft.departureCity.value) lines.push(`From: ${draft.departureCity.value}`);
    if (draft.departureDate.value) lines.push(`Departure: ${draft.departureDate.value}`);
    if (draft.returnDate.value) lines.push(`Return: ${draft.returnDate.value}`);
    if (draft.adults.value) lines.push(`Adults: ${draft.adults.value}`);
    if (draft.children.value) lines.push(`Children: ${draft.children.value}`);
    if (draft.childrenAges.value?.length) lines.push(`Children ages: ${draft.childrenAges.value.join(', ')}`);
    if (draft.infants.value) lines.push(`Infants: ${draft.infants.value}`);
    if (draft.tripType.value) lines.push(`Type: ${draft.tripType.value}`);
    if (draft.budgetMax.value) {
      const currency = draft.currency.value ?? 'USD';
      lines.push(`Budget: up to ${draft.budgetMax.value} ${currency}`);
    }
    if (draft.preferences.value?.length) lines.push(`Preferences: ${draft.preferences.value.join(', ')}`);
    if (draft.notes.value) lines.push(`Notes: ${draft.notes.value}`);

    const confirm = this.language.getTemplate('confirm_summary', lang);
    return lines.join('\n') + '\n\n' + confirm;
  }

  generateAcknowledgement(
    fields: SlotDefinition[],
    draft: TravelDraft,
  ): string {
    const parts: string[] = [];
    for (const field of fields) {
      const val = (draft[field.name] as { value: unknown }).value;
      if (val !== null && val !== undefined) {
        parts.push(`${field.name}: ${String(val)}`);
      }
    }
    return parts.join(', ');
  }
}
