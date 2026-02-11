import type { BookingStatus, MeetingStatus, MeetingProposalStatus } from '@/shared/lib';

export interface MeetingListItem {
  id: string;
  status: BookingStatus;
  totalPrice: string;
  currency: string;
  updatedAt: string;
  user: { id: string; firstName: string; lastName: string | null };
  agency: { id: string; name: string };
  offer: {
    totalPrice: string;
    travelRequest: { destination: string | null };
  };
  meetings: Array<{
    id: string;
    status: MeetingStatus;
    scheduledAt: string;
    location: string | null;
    createdAt: string;
  }>;
  meetingProposals: Array<{
    id: string;
    status: MeetingProposalStatus;
    proposedDate: string;
    proposedLocation: string | null;
    createdAt: string;
  }>;
}

export interface MeetingsQuery {
  status?: MeetingStatus;
  date?: string;
  page?: number;
  limit?: number;
}

export interface CounterProposePayload {
  dateTime: string;
  location?: string;
  notes?: string;
}

export interface CompleteMeetingPayload {
  notes?: string;
  amount?: number;
  paymentMethod?: string;
}

export interface CancelMeetingPayload {
  reason?: string;
}

// Calendar types

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  status: MeetingStatus;
  color: string;
  extendedProps: {
    bookingId: string;
    meetingId: string;
    userName: string;
    agencyName: string;
    destination: string | null;
    location: string | null;
    notes: string | null;
    status: MeetingStatus;
  };
}

export interface CalendarQuery {
  from: string;
  to: string;
  managerId?: string;
}

export interface ReschedulePayload {
  dateTime: string;
  location?: string;
  notes?: string;
}
