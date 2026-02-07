import { SlotName } from './slot.interface';

export enum FeedbackType {
  BOOKING_SUCCESS = 'BOOKING_SUCCESS',
  AGENT_EDIT = 'AGENT_EDIT',
  USER_CORRECTION = 'USER_CORRECTION',
  ABANDONED = 'ABANDONED',
}

export interface FeedbackSignal {
  conversationId: string;
  type: FeedbackType;
  fieldName: SlotName | null;
  originalValue: unknown;
  correctedValue: unknown;
  metadata: Record<string, unknown>;
}
