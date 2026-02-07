import { Injectable } from '@nestjs/common';
import {
  TravelDraft,
  TravelDraftField,
  DraftFieldSource,
  SlotName,
  ParseResult,
} from '../types';

@Injectable()
export class DraftMergeService {
  merge(currentDraft: TravelDraft, parseResult: ParseResult): TravelDraft {
    const now = new Date().toISOString();
    const merged = { ...currentDraft, version: currentDraft.version + 1 };

    for (const field of parseResult.extractedFields) {
      const slotName = field.slotName as SlotName;
      const existing = currentDraft[slotName] as TravelDraftField<unknown> | undefined;
      if (!existing) continue;

      const shouldOverwrite = this.shouldOverwrite(
        existing,
        field.confidence,
        field.parsedValue,
        parseResult.isCorrection,
      );

      if (shouldOverwrite) {
        (merged as Record<string, unknown>)[slotName] = {
          value: field.parsedValue,
          confidence: field.confidence,
          source: this.determineSource(field.confidence) as DraftFieldSource,
          updatedAt: now,
        } satisfies TravelDraftField<unknown>;
      }
    }

    return merged;
  }

  /**
   * Merge rules:
   * 1. CONFIRMED slots (confidence >= 1.0) never overwritten unless isCorrection
   * 2. New value overwrites when newConfidence > existingConfidence
   * 3. user_explicit source always overwrites ai_inferred/default
   * 4. Corrections always overwrite regardless of confidence
   */
  private shouldOverwrite(
    existing: TravelDraftField<unknown>,
    newConfidence: number,
    newValue: unknown,
    isCorrection: boolean,
  ): boolean {
    if (newValue === null || newValue === undefined) return false;
    if (isCorrection) return true;
    if (existing.confidence >= 1.0) return false;
    if (existing.value === null) return true;
    return newConfidence > existing.confidence;
  }

  private determineSource(confidence: number): DraftFieldSource {
    if (confidence >= 0.8) return 'user_explicit';
    if (confidence >= 0.5) return 'ai_inferred';
    return 'default';
  }
}
