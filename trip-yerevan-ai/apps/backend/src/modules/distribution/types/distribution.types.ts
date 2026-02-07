import { RfqDeliveryStatus } from '@prisma/client';

export const RFQ_DISTRIBUTION_QUEUE = 'rfq-distribution';
export const RFQ_DISTRIBUTION_JOB = 'deliver-rfq';

export interface RfqJobPayload {
  distributionId: string;
  travelRequestId: string;
  agencyId: string;
  /** Stored as string (not bigint) because BullMQ serializes payloads via JSON.stringify */
  agencyTelegramChatId: string | null;
  notification: RfqNotificationPayload;
}

export interface RfqNotificationPayload {
  travelRequestId: string;
  destination: string;
  departureCity: string;
  departureDate: string;
  returnDate: string | null;
  tripType: string | null;
  adults: number;
  children: number;
  childrenAges: number[];
  infants: number;
  budgetRange: string | null;
  currency: string;
  preferences: string[];
  notes: string | null;
  summaryText: string;
  language: string;
}

export interface DistributionResult {
  travelRequestId: string;
  totalAgenciesMatched: number;
  distributionIds: string[];
  agencyIds: string[];
}

export interface AgencyMatchResult {
  agencyId: string;
  agencyName: string;
  telegramChatId: bigint | null;
  matchScore: number;
  matchReasons: string[];
}

export { RfqDeliveryStatus };
