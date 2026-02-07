import { TravelDraft } from './travel-draft.interface';

export enum SlotStatus {
  MISSING = 'MISSING',
  PARTIAL = 'PARTIAL',
  FILLED = 'FILLED',
  CONFIRMED = 'CONFIRMED',
}

export type SlotName = keyof Omit<TravelDraft, 'version'>;

export interface SlotDefinition {
  name: SlotName;
  status: SlotStatus;
  required: boolean;
  priority: number;
}
