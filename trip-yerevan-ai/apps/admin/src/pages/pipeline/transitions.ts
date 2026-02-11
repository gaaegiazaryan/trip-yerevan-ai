import { BookingStatus } from '@/shared/lib';

export const VALID_BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
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
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.EXPIRED]: [],
  [BookingStatus.REJECTED_BY_AGENCY]: [],
};
