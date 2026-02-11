import { BookingStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Queue constants
// ---------------------------------------------------------------------------

export const BOOKING_QUEUE = 'booking';
export const BOOKING_EXPIRATION_JOB = 'booking-expiration';

// ---------------------------------------------------------------------------
// State machine transition map
// ---------------------------------------------------------------------------

export const VALID_BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> =
  {
    [BookingStatus.CREATED]: [BookingStatus.AWAITING_AGENCY_CONFIRMATION],
    [BookingStatus.AWAITING_AGENCY_CONFIRMATION]: [
      BookingStatus.AGENCY_CONFIRMED,
      BookingStatus.REJECTED_BY_AGENCY,
      BookingStatus.EXPIRED,
      BookingStatus.CANCELLED,
    ],
    [BookingStatus.AGENCY_CONFIRMED]: [
      BookingStatus.MANAGER_VERIFIED,
      BookingStatus.CANCELLED,
    ],
    [BookingStatus.MANAGER_VERIFIED]: [
      BookingStatus.MEETING_SCHEDULED,
      BookingStatus.CANCELLED,
    ],
    [BookingStatus.MEETING_SCHEDULED]: [
      BookingStatus.PAYMENT_PENDING,
      BookingStatus.CANCELLED,
    ],
    [BookingStatus.PAYMENT_PENDING]: [
      BookingStatus.PAID,
      BookingStatus.CANCELLED,
    ],
    [BookingStatus.PAID]: [
      BookingStatus.IN_PROGRESS,
      BookingStatus.CANCELLED,
    ],
    [BookingStatus.IN_PROGRESS]: [
      BookingStatus.COMPLETED,
      BookingStatus.CANCELLED,
    ],
    // Terminal states — no outgoing transitions
    [BookingStatus.COMPLETED]: [],
    [BookingStatus.CANCELLED]: [],
    [BookingStatus.EXPIRED]: [],
    [BookingStatus.REJECTED_BY_AGENCY]: [],
  };

// ---------------------------------------------------------------------------
// Timestamp field map: which DateTime field to set per target status
// ---------------------------------------------------------------------------

export const STATUS_TIMESTAMP_MAP: Partial<Record<BookingStatus, string>> = {
  [BookingStatus.AGENCY_CONFIRMED]: 'confirmedAt',
  [BookingStatus.MANAGER_VERIFIED]: 'managerVerifiedAt',
  [BookingStatus.PAID]: 'paidAt',
  [BookingStatus.CANCELLED]: 'cancelledAt',
  [BookingStatus.EXPIRED]: 'expiredAt',
};
