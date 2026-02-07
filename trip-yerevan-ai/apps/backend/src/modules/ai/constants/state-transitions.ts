import { ConversationState } from '../types';

export const VALID_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  [ConversationState.INITIAL]: [
    ConversationState.COLLECTING_DETAILS,
    ConversationState.CONFIRMING_DRAFT,
    ConversationState.CANCELLED,
  ],
  [ConversationState.COLLECTING_DETAILS]: [
    ConversationState.COLLECTING_DETAILS,
    ConversationState.CONFIRMING_DRAFT,
    ConversationState.CANCELLED,
  ],
  [ConversationState.CONFIRMING_DRAFT]: [
    ConversationState.COLLECTING_DETAILS,
    ConversationState.READY_FOR_RFQ,
    ConversationState.CANCELLED,
  ],
  [ConversationState.READY_FOR_RFQ]: [
    ConversationState.COMPLETED,
  ],
  [ConversationState.COMPLETED]: [],
  [ConversationState.CANCELLED]: [],
};
