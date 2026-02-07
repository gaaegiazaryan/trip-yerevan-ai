import { Injectable } from '@nestjs/common';
import { TravelDraft, TravelDraftField, SlotDefinition, SlotName, SlotStatus } from '../types';
import { SLOT_DEFINITIONS } from '../constants';

const CONFIDENCE_THRESHOLD = 0.7;

@Injectable()
export class SlotFillingService {
  evaluateSlots(draft: TravelDraft): SlotDefinition[] {
    return SLOT_DEFINITIONS.map((config) => ({
      name: config.name,
      required: config.required,
      priority: config.priority,
      status: this.computeStatus(draft[config.name]),
    }));
  }

  getMissingRequired(draft: TravelDraft): SlotDefinition[] {
    return this.evaluateSlots(draft)
      .filter((s) => s.required && (s.status === SlotStatus.MISSING || s.status === SlotStatus.PARTIAL))
      .sort((a, b) => a.priority - b.priority);
  }

  getNextSlotToAsk(draft: TravelDraft): SlotDefinition | null {
    const missing = this.getMissingRequired(draft);
    return missing[0] ?? null;
  }

  isComplete(draft: TravelDraft): boolean {
    return this.getMissingRequired(draft).length === 0;
  }

  getCompletionPercentage(draft: TravelDraft): number {
    const required = SLOT_DEFINITIONS.filter((s) => s.required);
    const filled = required.filter((config) => {
      const status = this.computeStatus(draft[config.name]);
      return status === SlotStatus.FILLED || status === SlotStatus.CONFIRMED;
    });
    return Math.round((filled.length / required.length) * 100);
  }

  private computeStatus(field: TravelDraftField<unknown>): SlotStatus {
    if (field.value === null || field.value === undefined) {
      return SlotStatus.MISSING;
    }
    if (field.confidence < CONFIDENCE_THRESHOLD) {
      return SlotStatus.PARTIAL;
    }
    return SlotStatus.FILLED;
  }
}
