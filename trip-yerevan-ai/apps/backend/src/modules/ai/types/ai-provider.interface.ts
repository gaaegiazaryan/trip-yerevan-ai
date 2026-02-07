import { TravelDraft } from './travel-draft.interface';
import { SupportedLanguage } from './language.types';

export interface AIProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIProviderResponse {
  content: string;
  tokensUsed: number;
  model: string;
}

export interface AIProviderInterface {
  parseMessage(
    userMessage: string,
    conversationHistory: AIProviderMessage[],
    currentDraft: TravelDraft,
    language: SupportedLanguage,
  ): Promise<AIProviderResponse>;
}
