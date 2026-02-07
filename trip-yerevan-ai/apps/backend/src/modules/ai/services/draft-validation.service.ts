import { Injectable } from '@nestjs/common';
import { TravelDraft } from '../types';
import {
  ValidationError,
  DraftValidationException,
} from '../../../common/exceptions/domain.exception';

@Injectable()
export class DraftValidationService {
  /**
   * Validates domain invariants on a TravelDraft.
   * Throws DraftValidationException with all violations if invalid.
   * Returns void if valid.
   */
  validate(draft: TravelDraft): void {
    const errors = this.collectErrors(draft);
    if (errors.length > 0) {
      throw new DraftValidationException(errors);
    }
  }

  /**
   * Non-throwing variant — returns errors for inspection.
   */
  getErrors(draft: TravelDraft): ValidationError[] {
    return this.collectErrors(draft);
  }

  isValid(draft: TravelDraft): boolean {
    return this.collectErrors(draft).length === 0;
  }

  private collectErrors(draft: TravelDraft): ValidationError[] {
    const errors: ValidationError[] = [];

    // destination required
    if (!draft.destination.value?.trim()) {
      errors.push({
        field: 'destination',
        message: 'Destination is required',
        value: draft.destination.value,
      });
    }

    // departureDate required + valid format
    if (!draft.departureDate.value?.trim()) {
      errors.push({
        field: 'departureDate',
        message: 'Departure date is required',
        value: draft.departureDate.value,
      });
    } else {
      const depDate = new Date(draft.departureDate.value);
      if (isNaN(depDate.getTime())) {
        errors.push({
          field: 'departureDate',
          message: 'Departure date is not a valid date',
          value: draft.departureDate.value,
        });
      }
    }

    // adults >= 1
    const adults = draft.adults.value ?? 0;
    if (adults < 1) {
      errors.push({
        field: 'adults',
        message: 'At least 1 adult is required',
        value: adults,
      });
    }

    // returnDate > departureDate if both exist
    if (draft.departureDate.value && draft.returnDate.value) {
      const dep = new Date(draft.departureDate.value);
      const ret = new Date(draft.returnDate.value);
      if (!isNaN(dep.getTime()) && !isNaN(ret.getTime()) && ret <= dep) {
        errors.push({
          field: 'returnDate',
          message: 'Return date must be after departure date',
          value: draft.returnDate.value,
        });
      }
    }

    // budgetMin <= budgetMax if both exist
    if (draft.budgetMin.value != null && draft.budgetMax.value != null) {
      if (draft.budgetMin.value > draft.budgetMax.value) {
        errors.push({
          field: 'budgetMin',
          message: 'Minimum budget must not exceed maximum budget',
          value: `${draft.budgetMin.value} > ${draft.budgetMax.value}`,
        });
      }
    }

    // children count matches childrenAges length
    const childrenCount = draft.children.value ?? 0;
    const agesLength = draft.childrenAges.value?.length ?? 0;
    if (childrenCount > 0 && agesLength > 0 && childrenCount !== agesLength) {
      errors.push({
        field: 'childrenAges',
        message: `Children count (${childrenCount}) does not match ages provided (${agesLength})`,
        value: draft.childrenAges.value,
      });
    }

    return errors;
  }
}
