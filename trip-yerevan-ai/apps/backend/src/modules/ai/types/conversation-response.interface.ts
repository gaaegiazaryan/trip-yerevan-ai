import { ConversationState } from './conversation-state.enum';
import { TravelDraft } from './travel-draft.interface';
import { SupportedLanguage } from './language.types';

export interface SuggestedAction {
  type: 'confirm' | 'cancel' | 'edit_field';
  label: string;
  payload: string;
}

export interface ConversationResponse {
  conversationId: string;
  state: ConversationState;
  textResponse: string;
  draft: TravelDraft | null;
  isComplete: boolean;
  suggestedActions: SuggestedAction[];
  language: SupportedLanguage;
}
