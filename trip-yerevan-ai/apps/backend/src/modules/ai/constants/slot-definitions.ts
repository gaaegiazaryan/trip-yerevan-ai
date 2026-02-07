import { SlotName } from '../types';

export interface SlotConfig {
  name: SlotName;
  required: boolean;
  priority: number;
}

export const SLOT_DEFINITIONS: SlotConfig[] = [
  { name: 'destination',    required: true,  priority: 1 },
  { name: 'departureDate',  required: true,  priority: 2 },
  { name: 'adults',         required: true,  priority: 3 },
  { name: 'departureCity',  required: true,  priority: 4 },
  { name: 'tripType',       required: true,  priority: 5 },
  { name: 'returnDate',     required: false, priority: 6 },
  { name: 'children',       required: false, priority: 7 },
  { name: 'childrenAges',   required: false, priority: 7 },
  { name: 'infants',        required: false, priority: 7 },
  { name: 'budgetMin',      required: false, priority: 8 },
  { name: 'budgetMax',      required: false, priority: 8 },
  { name: 'currency',       required: false, priority: 8 },
  { name: 'preferences',    required: false, priority: 9 },
  { name: 'notes',          required: false, priority: 10 },
];
