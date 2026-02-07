import { Injectable } from '@nestjs/common';
import { TravelRequest } from '@prisma/client';
import { RfqNotificationPayload } from '../types';

@Injectable()
export class RfqNotificationBuilder {
  /**
   * Builds a structured notification payload from a TravelRequest.
   * Used both for persistence (stored in RfqDistribution.notificationPayload)
   * and for rendering Telegram messages to agencies.
   */
  build(request: TravelRequest): RfqNotificationPayload {
    const budgetRange = this.formatBudget(request);
    const summaryText = this.buildSummary(request, budgetRange);

    return {
      travelRequestId: request.id,
      destination: request.destination ?? 'Not specified',
      departureCity: request.departureCity,
      departureDate: request.departureDate
        ? request.departureDate.toISOString().split('T')[0]
        : 'Not specified',
      returnDate: request.returnDate
        ? request.returnDate.toISOString().split('T')[0]
        : null,
      tripType: request.tripType,
      adults: request.adults,
      children: request.children,
      childrenAges: request.childrenAges,
      infants: request.infants,
      budgetRange,
      currency: request.currency,
      preferences: request.preferences,
      notes: request.notes,
      summaryText,
      language: request.language,
    };
  }

  private formatBudget(request: TravelRequest): string | null {
    const min = request.budgetMin ? Number(request.budgetMin) : null;
    const max = request.budgetMax ? Number(request.budgetMax) : null;

    if (min && max) return `${min}-${max} ${request.currency}`;
    if (max) return `up to ${max} ${request.currency}`;
    if (min) return `from ${min} ${request.currency}`;
    return null;
  }

  private buildSummary(
    request: TravelRequest,
    budgetRange: string | null,
  ): string {
    const lines: string[] = [];

    lines.push(`New travel request`);
    lines.push(`Destination: ${request.destination ?? 'TBD'}`);
    lines.push(`From: ${request.departureCity}`);

    if (request.departureDate) {
      const dep = request.departureDate.toISOString().split('T')[0];
      const ret = request.returnDate
        ? request.returnDate.toISOString().split('T')[0]
        : 'open';
      lines.push(`Dates: ${dep} → ${ret}`);
    }

    const travelers: string[] = [];
    travelers.push(`${request.adults} adult${request.adults > 1 ? 's' : ''}`);
    if (request.children > 0) {
      travelers.push(
        `${request.children} child${request.children > 1 ? 'ren' : ''}` +
          (request.childrenAges.length > 0
            ? ` (ages: ${request.childrenAges.join(', ')})`
            : ''),
      );
    }
    if (request.infants > 0) {
      travelers.push(`${request.infants} infant${request.infants > 1 ? 's' : ''}`);
    }
    lines.push(`Travelers: ${travelers.join(', ')}`);

    if (request.tripType) lines.push(`Type: ${request.tripType}`);
    if (budgetRange) lines.push(`Budget: ${budgetRange}`);
    if (request.preferences.length > 0) {
      lines.push(`Preferences: ${request.preferences.join(', ')}`);
    }
    if (request.notes) lines.push(`Notes: ${request.notes}`);

    return lines.join('\n');
  }
}
