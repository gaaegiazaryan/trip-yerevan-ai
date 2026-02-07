import { Injectable } from '@nestjs/common';
import {
  ConversationState,
  ConversationResponse,
  SuggestedAction,
  TravelDraft,
  SupportedLanguage,
  ParseResult,
} from '../types';
import { ClarificationService } from './clarification.service';
import { SlotFillingService } from './slot-filling.service';
import { LanguageService } from './language.service';

@Injectable()
export class ResponseGeneratorService {
  constructor(
    private readonly clarification: ClarificationService,
    private readonly slotFilling: SlotFillingService,
    private readonly language: LanguageService,
  ) {}

  generate(
    conversationId: string,
    state: ConversationState,
    draft: TravelDraft,
    parseResult: ParseResult,
    lang: SupportedLanguage,
  ): ConversationResponse {
    const textResponse = this.buildText(state, draft, parseResult, lang);
    const suggestedActions = this.buildActions(state, lang);

    return {
      conversationId,
      state,
      textResponse,
      draft,
      isComplete: state === ConversationState.READY_FOR_RFQ || state === ConversationState.COMPLETED,
      suggestedActions,
      language: lang,
    };
  }

  private buildText(
    state: ConversationState,
    draft: TravelDraft,
    parseResult: ParseResult,
    lang: SupportedLanguage,
  ): string {
    if (parseResult.isGreeting && state === ConversationState.COLLECTING_DETAILS) {
      return this.language.getTemplate('greeting', lang);
    }

    switch (state) {
      case ConversationState.INITIAL:
        return this.language.getTemplate('greeting', lang);

      case ConversationState.COLLECTING_DETAILS: {
        // After edit button: all slots still filled, no "next question" to ask.
        // Use the correction prompt to ask what to change.
        if (parseResult.isCorrection) {
          return this.language.getTemplate('correction_prompt', lang);
        }
        const ack = this.buildAcknowledgement(parseResult, draft);
        const question = this.clarification.generateQuestion(draft, lang);
        // Fallback: if no question generated (all slots filled after a natural correction),
        // show the correction prompt rather than sending an empty message.
        if (!question) {
          return ack
            ? `${ack}\n\n${this.language.getTemplate('correction_prompt', lang)}`
            : this.language.getTemplate('correction_prompt', lang);
        }
        return ack ? `${ack}\n\n${question}` : question;
      }

      case ConversationState.CONFIRMING_DRAFT:
        return this.clarification.generateSummary(draft, lang);

      case ConversationState.READY_FOR_RFQ:
      case ConversationState.COMPLETED:
        return this.language.getTemplate('request_confirmed', lang);

      case ConversationState.CANCELLED:
        return this.language.getTemplate('request_cancelled', lang);

      default:
        return this.language.getTemplate('error_generic', lang);
    }
  }

  private buildAcknowledgement(
    parseResult: ParseResult,
    draft: TravelDraft,
  ): string {
    if (parseResult.extractedFields.length === 0) return '';

    const filledSlots = this.slotFilling.evaluateSlots(draft);
    const acknowledgedFields = parseResult.extractedFields
      .filter((f) => {
        const slot = filledSlots.find((s) => s.name === f.slotName);
        return slot && f.parsedValue !== null;
      });

    if (acknowledgedFields.length === 0) return '';

    return this.clarification.generateAcknowledgement(
      acknowledgedFields.map((f) => ({
        name: f.slotName,
        required: true,
        priority: 0,
        status: 'filled' as never,
      })),
      draft,
    );
  }

  private buildActions(
    state: ConversationState,
    lang: SupportedLanguage,
  ): SuggestedAction[] {
    switch (state) {
      case ConversationState.CONFIRMING_DRAFT:
        return [
          {
            type: 'confirm',
            label: lang === 'RU' ? 'Да, всё верно' : lang === 'AM' ? 'Այո' : 'Yes, confirm',
            payload: 'confirm',
          },
          {
            type: 'edit_field',
            label: lang === 'RU' ? 'Изменить' : lang === 'AM' ? 'Փdelays' : 'Edit',
            payload: 'edit',
          },
          {
            type: 'cancel',
            label: lang === 'RU' ? 'Отмена' : lang === 'AM' ? 'Չdelays' : 'Cancel',
            payload: 'cancel',
          },
        ];

      case ConversationState.COLLECTING_DETAILS:
        return [
          {
            type: 'cancel',
            label: lang === 'RU' ? 'Отмена' : lang === 'AM' ? 'Չdelays' : 'Cancel',
            payload: 'cancel',
          },
        ];

      default:
        return [];
    }
  }
}
