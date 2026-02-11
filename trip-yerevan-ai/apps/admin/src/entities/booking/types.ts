import type { BookingStatus, MeetingStatus, MeetingProposalStatus, MeetingProposer } from '@/shared/lib';

export interface BookingUser {
  id: string;
  firstName: string;
  lastName: string | null;
  phone?: string | null;
  telegramId?: string;
}

export interface BookingAgency {
  id: string;
  name: string;
}

export interface BookingOfferSummary {
  destination: string | null;
  departureDate: string | null;
  totalPrice: string;
}

export interface BookingListItem {
  id: string;
  status: BookingStatus;
  totalPrice: string;
  currency: string;
  createdAt: string;
  user: BookingUser;
  agency: BookingAgency;
  offer: BookingOfferSummary;
}

export interface BookingOffer {
  id: string;
  totalPrice: string;
  currency: string;
  hotelName: string | null;
  departureDate: string | null;
  returnDate: string | null;
  nightsCount: number | null;
  adults: number | null;
  description: string | null;
  travelRequest: {
    id: string;
    destination: string | null;
    departureCity: string | null;
    rawText: string | null;
    adults: number | null;
    children: number | null;
  };
}

export interface BookingMeeting {
  id: string;
  status: MeetingStatus;
  scheduledAt: string;
  location: string | null;
  notes: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface BookingProposal {
  id: string;
  status: MeetingProposalStatus;
  proposerRole: MeetingProposer;
  proposedDate: string;
  proposedLocation: string | null;
  notes: string | null;
  respondedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export interface BookingEvent {
  id: string;
  fromStatus: BookingStatus;
  toStatus: BookingStatus;
  triggeredBy: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface BookingDetail {
  id: string;
  status: BookingStatus;
  totalPrice: string;
  currency: string;
  managerNotes: string | null;
  verificationChecklist: Record<string, boolean> | null;
  confirmedAt: string | null;
  managerVerifiedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  user: BookingUser;
  agency: BookingAgency;
  offer: BookingOffer;
  meetings: BookingMeeting[];
  meetingProposals: BookingProposal[];
  events: BookingEvent[];
}

export interface BookingsQuery {
  status?: BookingStatus;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface VerifyBookingPayload {
  action: 'CONFIRM' | 'REJECT';
  notes?: string;
  checklist?: Record<string, boolean>;
}

export interface KanbanQuery {
  from?: string;
  to?: string;
  q?: string;
  managerId?: string;
}

export type KanbanColumns = Record<string, BookingListItem[]>;

export interface AssignManagerPayload {
  managerId: string;
}

export interface SetStatusPayload {
  status: string;
  reason?: string;
}

export interface RescheduleProposalPayload {
  suggestedAt: string;
  location?: string;
}
