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

/**
 * Display-friendly names for enum values that contain underscores
 * (which break Telegram Markdown parsing).
 */
const TRIP_TYPE_DISPLAY: Record<string, Record<SupportedLanguage, string>> = {
  PACKAGE_TOUR: { RU: 'Пакетный тур', AM: 'Package Tour', EN: 'Package Tour' },
  FLIGHT_ONLY: { RU: 'Только перелёт', AM: 'Flight Only', EN: 'Flight Only' },
  HOTEL_ONLY: { RU: 'Только отель', AM: 'Hotel Only', EN: 'Hotel Only' },
  EXCURSION: { RU: 'Экскурсия', AM: 'Excursion', EN: 'Excursion' },
  CUSTOM: { RU: 'Индивидуальный', AM: 'Custom', EN: 'Custom' },
};

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
    const label = this.summaryLabels(lang);
    const lines: string[] = [];

    if (draft.destination.value) lines.push(`${label.destination}: ${draft.destination.value}`);
    if (draft.departureCity.value) lines.push(`${label.from}: ${draft.departureCity.value}`);
    if (draft.departureDate.value) lines.push(`${label.departure}: ${draft.departureDate.value}`);
    if (draft.returnDate.value) lines.push(`${label.return}: ${draft.returnDate.value}`);
    if (draft.adults.value) lines.push(`${label.adults}: ${draft.adults.value}`);
    if (draft.children.value) lines.push(`${label.children}: ${draft.children.value}`);
    if (draft.childrenAges.value) {
      const ages = Array.isArray(draft.childrenAges.value)
        ? draft.childrenAges.value.join(', ')
        : String(draft.childrenAges.value);
      if (ages) lines.push(`${label.childrenAges}: ${ages}`);
    }
    if (draft.infants.value) lines.push(`${label.infants}: ${draft.infants.value}`);
    if (draft.tripType.value) {
      const displayType = TRIP_TYPE_DISPLAY[draft.tripType.value]?.[lang] ?? draft.tripType.value;
      lines.push(`${label.type}: ${displayType}`);
    }
    if (draft.budgetMax.value) {
      const currency = draft.currency.value ?? 'USD';
      lines.push(`${label.budget}: ${draft.budgetMin.value ? `${draft.budgetMin.value}-` : ''}${draft.budgetMax.value} ${currency}`);
    }
    if (draft.preferences.value) {
      const prefs = Array.isArray(draft.preferences.value)
        ? draft.preferences.value.join(', ')
        : String(draft.preferences.value);
      if (prefs) lines.push(`${label.preferences}: ${prefs}`);
    }
    if (draft.notes.value) lines.push(`${label.notes}: ${draft.notes.value}`);

    const confirm = this.language.getTemplate('confirm_summary', lang);
    return lines.join('\n') + '\n\n' + confirm;
  }

  private summaryLabels(lang: SupportedLanguage) {
    if (lang === 'RU') {
      return {
        destination: 'Направление', from: 'Город вылета', departure: 'Вылет',
        return: 'Возврат', adults: 'Взрослые', children: 'Дети',
        childrenAges: 'Возраст детей', infants: 'Младенцы', type: 'Тип',
        budget: 'Бюджет', preferences: 'Пожелания', notes: 'Заметки',
      };
    }
    return {
      destination: 'Destination', from: 'From', departure: 'Departure',
      return: 'Return', adults: 'Adults', children: 'Children',
      childrenAges: 'Children ages', infants: 'Infants', type: 'Type',
      budget: 'Budget', preferences: 'Preferences', notes: 'Notes',
    };
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
