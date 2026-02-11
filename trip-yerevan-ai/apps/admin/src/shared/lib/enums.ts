export enum AgencyStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
  BLOCKED = 'BLOCKED',
}

export const AGENCY_STATUS_LABELS: Record<AgencyStatus, string> = {
  [AgencyStatus.PENDING]: 'Pending',
  [AgencyStatus.APPROVED]: 'Approved',
  [AgencyStatus.REJECTED]: 'Rejected',
  [AgencyStatus.SUSPENDED]: 'Suspended',
  [AgencyStatus.BLOCKED]: 'Blocked',
};

export const AGENCY_STATUS_COLORS: Record<AgencyStatus, string> = {
  [AgencyStatus.PENDING]: 'warning',
  [AgencyStatus.APPROVED]: 'success',
  [AgencyStatus.REJECTED]: 'danger',
  [AgencyStatus.SUSPENDED]: 'info',
  [AgencyStatus.BLOCKED]: 'danger',
};

export enum BookingStatus {
  CREATED = 'CREATED',
  AWAITING_AGENCY_CONFIRMATION = 'AWAITING_AGENCY_CONFIRMATION',
  AGENCY_CONFIRMED = 'AGENCY_CONFIRMED',
  MANAGER_VERIFIED = 'MANAGER_VERIFIED',
  MEETING_SCHEDULED = 'MEETING_SCHEDULED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAID = 'PAID',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  REJECTED_BY_AGENCY = 'REJECTED_BY_AGENCY',
}

export enum MeetingStatus {
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export enum MeetingProposalStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  COUNTER_PROPOSED = 'COUNTER_PROPOSED',
  EXPIRED = 'EXPIRED',
}

export enum MeetingProposer {
  USER = 'USER',
  MANAGER = 'MANAGER',
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  [BookingStatus.CREATED]: 'Created',
  [BookingStatus.AWAITING_AGENCY_CONFIRMATION]: 'Awaiting Agency',
  [BookingStatus.AGENCY_CONFIRMED]: 'Agency Confirmed',
  [BookingStatus.MANAGER_VERIFIED]: 'Verified',
  [BookingStatus.MEETING_SCHEDULED]: 'Meeting Phase',
  [BookingStatus.PAYMENT_PENDING]: 'Payment Pending',
  [BookingStatus.PAID]: 'Paid',
  [BookingStatus.IN_PROGRESS]: 'In Progress',
  [BookingStatus.COMPLETED]: 'Completed',
  [BookingStatus.CANCELLED]: 'Cancelled',
  [BookingStatus.EXPIRED]: 'Expired',
  [BookingStatus.REJECTED_BY_AGENCY]: 'Rejected',
};

export const BOOKING_STATUS_COLORS: Record<BookingStatus, string> = {
  [BookingStatus.CREATED]: 'info',
  [BookingStatus.AWAITING_AGENCY_CONFIRMATION]: 'warning',
  [BookingStatus.AGENCY_CONFIRMED]: '',
  [BookingStatus.MANAGER_VERIFIED]: 'success',
  [BookingStatus.MEETING_SCHEDULED]: 'warning',
  [BookingStatus.PAYMENT_PENDING]: 'warning',
  [BookingStatus.PAID]: 'success',
  [BookingStatus.IN_PROGRESS]: '',
  [BookingStatus.COMPLETED]: 'success',
  [BookingStatus.CANCELLED]: 'danger',
  [BookingStatus.EXPIRED]: 'info',
  [BookingStatus.REJECTED_BY_AGENCY]: 'danger',
};

export const MEETING_STATUS_COLORS: Record<MeetingStatus, string> = {
  [MeetingStatus.SCHEDULED]: 'warning',
  [MeetingStatus.CONFIRMED]: '',
  [MeetingStatus.COMPLETED]: 'success',
  [MeetingStatus.CANCELLED]: 'danger',
  [MeetingStatus.NO_SHOW]: 'info',
};

export const PROPOSAL_STATUS_COLORS: Record<MeetingProposalStatus, string> = {
  [MeetingProposalStatus.PENDING]: 'warning',
  [MeetingProposalStatus.ACCEPTED]: 'success',
  [MeetingProposalStatus.REJECTED]: 'danger',
  [MeetingProposalStatus.COUNTER_PROPOSED]: 'info',
  [MeetingProposalStatus.EXPIRED]: 'info',
};

export const KANBAN_COLUMN_ORDER: BookingStatus[] = [
  BookingStatus.CREATED,
  BookingStatus.AWAITING_AGENCY_CONFIRMATION,
  BookingStatus.AGENCY_CONFIRMED,
  BookingStatus.MANAGER_VERIFIED,
  BookingStatus.MEETING_SCHEDULED,
  BookingStatus.PAYMENT_PENDING,
  BookingStatus.PAID,
  BookingStatus.IN_PROGRESS,
];

export const RISK_SEVERITY_LABELS: Record<string, string> = {
  LOW: 'Low',
  MED: 'Medium',
  HIGH: 'High',
};

export const RISK_SEVERITY_COLORS: Record<string, string> = {
  LOW: 'info',
  MED: 'warning',
  HIGH: 'danger',
};

export const RISK_ENTITY_TYPE_LABELS: Record<string, string> = {
  USER: 'User',
  AGENCY: 'Agency',
  PROXY_CHAT: 'Proxy Chat',
  BOOKING: 'Booking',
};

export const MEETING_CALENDAR_COLORS: Record<MeetingStatus, string> = {
  [MeetingStatus.SCHEDULED]: '#409EFF',
  [MeetingStatus.CONFIRMED]: '#67C23A',
  [MeetingStatus.COMPLETED]: '#909399',
  [MeetingStatus.CANCELLED]: '#F56C6C',
  [MeetingStatus.NO_SHOW]: '#E6A23C',
};
