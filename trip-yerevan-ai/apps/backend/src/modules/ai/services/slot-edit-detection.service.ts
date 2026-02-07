import { Injectable } from '@nestjs/common';
import { SlotName, SupportedLanguage } from '../types';

export interface SlotEditGroup {
  key: string;
  slots: SlotName[];
  labels: Record<SupportedLanguage, string>;
}

export interface SlotEditResult {
  group: SlotEditGroup;
  slots: SlotName[];
}

/**
 * Editable field groups with display labels and synonyms.
 * Each group maps to one or more TravelDraft slots.
 */
const EDIT_GROUPS: (SlotEditGroup & { synonyms: string[] })[] = [
  {
    key: 'destination',
    slots: ['destination'],
    labels: { RU: 'Направление', AM: 'Destination', EN: 'Destination' },
    synonyms: [
      'destination', 'направление', 'куда', 'место', 'страна',
      'город назначения', 'страну', 'направления',
    ],
  },
  {
    key: 'dates',
    slots: ['departureDate', 'returnDate'],
    labels: { RU: 'Даты', AM: 'Dates', EN: 'Dates' },
    synonyms: [
      'dates', 'date', 'даты', 'дату', 'дата', 'когда', 'период',
      'дату вылета', 'дата возврата', 'дата вылета', 'дата возвращения',
      'departure date', 'return date',
    ],
  },
  {
    key: 'departureCity',
    slots: ['departureCity'],
    labels: { RU: 'Город вылета', AM: 'Departure city', EN: 'Departure city' },
    synonyms: [
      'departure city', 'departurecity', 'город вылета', 'откуда',
      'город отправления', 'вылет из', 'город',
    ],
  },
  {
    key: 'travelers',
    slots: ['adults', 'children', 'childrenAges', 'infants'],
    labels: { RU: 'Путешественники', AM: 'Travelers', EN: 'Travelers' },
    synonyms: [
      'travelers', 'travellers', 'путешественники', 'количество',
      'взрослые', 'дети', 'сколько человек', 'adults', 'children',
      'кол-во', 'пассажиры', 'людей',
    ],
  },
  {
    key: 'tripType',
    slots: ['tripType'],
    labels: { RU: 'Тип поездки', AM: 'Trip type', EN: 'Trip type' },
    synonyms: [
      'trip type', 'triptype', 'тип', 'тип поездки', 'вид',
      'вид поездки', 'тип тура', 'type',
    ],
  },
  {
    key: 'budget',
    slots: ['budgetMin', 'budgetMax', 'currency'],
    labels: { RU: 'Бюджет', AM: 'Budget', EN: 'Budget' },
    synonyms: [
      'budget', 'бюджет', 'цена', 'стоимость', 'деньги',
      'сколько стоит', 'цену', 'бюджета',
    ],
  },
  {
    key: 'notes',
    slots: ['notes', 'preferences'],
    labels: { RU: 'Заметки', AM: 'Notes', EN: 'Notes' },
    synonyms: [
      'notes', 'заметки', 'пожелания', 'preferences', 'особые',
      'примечания', 'дополнительно',
    ],
  },
];

@Injectable()
export class SlotEditDetectionService {
  /**
   * Detect which slot group the user wants to edit.
   * Works with both callback keys (e.g. "dates") and free-text input
   * (e.g. "даты", "дату вылета").
   *
   * Returns null if no match found.
   */
  detect(input: string): SlotEditResult | null {
    const normalized = input.toLowerCase().trim();
    if (!normalized) return null;

    // 1. Exact match on group key (from inline keyboard callbacks)
    for (const group of EDIT_GROUPS) {
      if (group.key === normalized) {
        return { group, slots: group.slots };
      }
    }

    // 2. Exact synonym match
    for (const group of EDIT_GROUPS) {
      if (group.synonyms.includes(normalized)) {
        return { group, slots: group.slots };
      }
    }

    // 3. Partial match: input contains a synonym or synonym contains input
    for (const group of EDIT_GROUPS) {
      for (const synonym of group.synonyms) {
        if (normalized.includes(synonym) || synonym.includes(normalized)) {
          return { group, slots: group.slots };
        }
      }
    }

    return null;
  }

  /**
   * Get all editable field groups for building inline keyboard.
   */
  getEditableGroups(): SlotEditGroup[] {
    return EDIT_GROUPS.map(({ key, slots, labels }) => ({ key, slots, labels }));
  }
}
