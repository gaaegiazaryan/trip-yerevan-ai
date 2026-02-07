import { Injectable } from '@nestjs/common';
import { ConversationState, TravelDraft, ParseResult } from '../types';
import { SlotFillingService } from './slot-filling.service';
import { VALID_TRANSITIONS } from '../constants';

@Injectable()
export class ConversationStateService {
  constructor(private readonly slotFilling: SlotFillingService) {}

  transition(
    currentState: ConversationState,
    draft: TravelDraft,
    parseResult: ParseResult,
  ): ConversationState {
    if (parseResult.isCancellation) {
      return this.tryTransition(currentState, ConversationState.CANCELLED);
    }

    if (
      currentState === ConversationState.CONFIRMING_DRAFT &&
      parseResult.isConfirmation
    ) {
      return this.tryTransition(currentState, ConversationState.READY_FOR_RFQ);
    }

    if (
      currentState === ConversationState.CONFIRMING_DRAFT &&
      parseResult.isCorrection
    ) {
      return this.tryTransition(currentState, ConversationState.COLLECTING_DETAILS);
    }

    if (this.slotFilling.isComplete(draft)) {
      return this.tryTransition(
        currentState,
        ConversationState.CONFIRMING_DRAFT,
      );
    }

    if (currentState === ConversationState.INITIAL) {
      return this.tryTransition(currentState, ConversationState.COLLECTING_DETAILS);
    }

    return currentState;
  }

  canTransition(
    from: ConversationState,
    to: ConversationState,
  ): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  getInitialState(): ConversationState {
    return ConversationState.INITIAL;
  }

  private tryTransition(
    from: ConversationState,
    to: ConversationState,
  ): ConversationState {
    if (this.canTransition(from, to)) return to;
    return from;
  }
}
