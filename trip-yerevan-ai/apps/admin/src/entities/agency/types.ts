import type { AgencyStatus } from '@/shared/lib';

export interface AgencyVerifier {
  id: string;
  firstName: string;
  lastName: string | null;
}

export interface AgencyMember {
  id: string;
  role: string;
  status: string;
  user: {
    id: string;
    firstName: string;
    lastName: string | null;
    telegramId: string;
  };
}

export interface AgencyListItem {
  id: string;
  name: string;
  status: AgencyStatus;
  contactEmail: string | null;
  contactPhone: string;
  specializations: string[];
  regions: string[];
  rating: string;
  trustBadge: boolean;
  rejectionReason: string | null;
  verifiedAt: string | null;
  verifiedBy: AgencyVerifier | null;
  createdAt: string;
  _count: {
    offers: number;
    bookings: number;
    memberships: number;
  };
}

export interface AgencyDetail extends AgencyListItem {
  description: string | null;
  telegramChatId: string | null;
  agencyTelegramChatId: string | null;
  updatedAt: string;
  memberships: AgencyMember[];
  _count: {
    offers: number;
    bookings: number;
    memberships: number;
    rfqDistributions: number;
  };
}

export interface AgenciesQuery {
  status?: AgencyStatus;
  q?: string;
  page?: number;
  limit?: number;
}

export interface VerifyAgencyPayload {
  action: 'APPROVE' | 'REJECT' | 'BLOCK';
  reason?: string;
}

export interface TrustBadgePayload {
  enabled: boolean;
}

export interface AgencyPerformance {
  agencyId: string;
  agencyName: string;
  offersSent: number;
  bookingsWon: number;
  winRate: number;
  avgOfferPrice: number | null;
  avgResponseHours: number | null;
  totalRevenue: number;
  cancellationRate: number;
}

export interface PerformanceQuery {
  from?: string;
  to?: string;
}
