import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import {
  TravelRequestStatus,
  TripType,
  Currency,
  Language,
  AIConversationStatus,
} from '@prisma/client';
import { TravelDraft, ConversationState, SupportedLanguage } from '../types';
import { DraftValidationService } from './draft-validation.service';
import { DraftConversionException } from '../../../common/exceptions/domain.exception';

const DEFAULT_EXPIRY_DAYS = 14;

const TRIP_TYPE_MAP: Record<string, TripType> = {
  PACKAGE_TOUR: TripType.PACKAGE,
  PACKAGE: TripType.PACKAGE,
  FLIGHT_ONLY: TripType.FLIGHT_ONLY,
  HOTEL_ONLY: TripType.HOTEL_ONLY,
  EXCURSION: TripType.EXCURSION,
  CUSTOM: TripType.CUSTOM,
};

const CURRENCY_MAP: Record<string, Currency> = {
  USD: Currency.USD,
  EUR: Currency.EUR,
  RUB: Currency.RUB,
  AMD: Currency.AMD,
};

const LANGUAGE_MAP: Record<SupportedLanguage, Language> = {
  RU: Language.RU,
  AM: Language.AM,
  EN: Language.EN,
};

export interface ConversionResult {
  travelRequestId: string;
  conversationId: string;
}

@Injectable()
export class DraftToRequestService {
  private readonly logger = new Logger(DraftToRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: DraftValidationService,
  ) {}

  /**
   * Converts a validated TravelDraft into a TravelRequest entity.
   *
   * Runs inside a single Prisma transaction:
   *   1. Validate domain invariants
   *   2. Create TravelRequest with status READY
   *   3. Complete AIConversation (link travelRequestId, set COMPLETED)
   *   4. Return result
   *
   * Throws DraftValidationException if draft is invalid.
   * Throws DraftConversionException if persistence fails.
   */
  async convert(
    conversationId: string,
    userId: string,
    draft: TravelDraft,
    language: SupportedLanguage,
  ): Promise<ConversionResult> {
    // 1. Validate — throws DraftValidationException
    this.validation.validate(draft);

    // 2. Build raw text summary for audit trail
    const rawText = this.buildRawText(draft);

    // 3. Map fields
    const departureDate = new Date(draft.departureDate.value!);
    const returnDate = draft.returnDate.value
      ? new Date(draft.returnDate.value)
      : null;
    const tripType = draft.tripType.value
      ? TRIP_TYPE_MAP[draft.tripType.value] ?? null
      : null;
    const currency = draft.currency.value
      ? CURRENCY_MAP[draft.currency.value] ?? Currency.USD
      : Currency.USD;
    const expiresAt = new Date(
      Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    this.logger.log(
      `[draft-convert] destination="${draft.destination.value}" ` +
        `(conversation: ${conversationId}, user: ${userId})`,
    );

    try {
      // 4. Execute in transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Create TravelRequest
        const travelRequest = await tx.travelRequest.create({
          data: {
            userId,
            status: TravelRequestStatus.READY,
            rawText,
            language: LANGUAGE_MAP[language],
            destination: draft.destination.value!,
            departureCity: draft.departureCity.value ?? 'Yerevan',
            departureDate,
            returnDate,
            tripType,
            adults: draft.adults.value ?? 1,
            children: draft.children.value ?? 0,
            childrenAges: draft.childrenAges.value ?? [],
            infants: draft.infants.value ?? 0,
            budgetMin: draft.budgetMin.value ?? undefined,
            budgetMax: draft.budgetMax.value ?? undefined,
            currency,
            preferences: draft.preferences.value ?? [],
            notes: draft.notes.value ?? undefined,
            expiresAt,
          },
        });

        // Complete AIConversation — link to TravelRequest
        await tx.aIConversation.update({
          where: { id: conversationId },
          data: {
            travelRequestId: travelRequest.id,
            status: AIConversationStatus.COMPLETED,
            conversationState: ConversationState.COMPLETED,
            completedAt: new Date(),
          },
        });

        return { travelRequestId: travelRequest.id };
      });

      this.logger.log(
        `[draft-convert] Created TravelRequest ${result.travelRequestId} ` +
          `destination="${draft.destination.value}" ` +
          `(conversation: ${conversationId}, user: ${userId})`,
      );

      return {
        travelRequestId: result.travelRequestId,
        conversationId,
      };
    } catch (error) {
      // Re-throw domain exceptions as-is
      if (error instanceof DraftConversionException) throw error;

      this.logger.error(
        `Transaction failed for conversation ${conversationId}: ${error}`,
      );
      throw new DraftConversionException(
        error instanceof Error ? error.message : 'Unknown error',
        conversationId,
      );
    }
  }

  private buildRawText(draft: TravelDraft): string {
    const parts: string[] = [];

    if (draft.destination.value) parts.push(`Destination: ${draft.destination.value}`);
    if (draft.departureCity.value) parts.push(`From: ${draft.departureCity.value}`);
    if (draft.departureDate.value) parts.push(`Departure: ${draft.departureDate.value}`);
    if (draft.returnDate.value) parts.push(`Return: ${draft.returnDate.value}`);
    if (draft.adults.value) parts.push(`Adults: ${draft.adults.value}`);
    if (draft.children.value) parts.push(`Children: ${draft.children.value}`);
    if (draft.childrenAges.value?.length) parts.push(`Ages: ${draft.childrenAges.value.join(', ')}`);
    if (draft.infants.value) parts.push(`Infants: ${draft.infants.value}`);
    if (draft.tripType.value) parts.push(`Type: ${draft.tripType.value}`);
    if (draft.budgetMax.value) {
      const cur = draft.currency.value ?? 'USD';
      const min = draft.budgetMin.value;
      parts.push(min ? `Budget: ${min}-${draft.budgetMax.value} ${cur}` : `Budget: up to ${draft.budgetMax.value} ${cur}`);
    }
    if (draft.preferences.value?.length) parts.push(`Preferences: ${draft.preferences.value.join(', ')}`);
    if (draft.notes.value) parts.push(`Notes: ${draft.notes.value}`);

    return parts.join('\n');
  }
}
