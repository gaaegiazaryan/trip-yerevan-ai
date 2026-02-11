export interface OverviewAnalytics {
  funnel: {
    travelRequests: number;
    withOffers: number;
    withBookings: number;
    withMeetings: number;
    paid: number;
    completed: number;
  };
  revenue: {
    total: number;
    average: number;
    count: number;
    byCurrency: Array<{ currency: string; total: number }>;
  };
  trends: Array<{
    date: string;
    travelRequests: number;
    offers: number;
    bookings: number;
  }>;
  responseTimes: {
    avgOfferResponseHours: number | null;
    avgAgencyConfirmHours: number | null;
  };
}

export interface AgencyAnalytics {
  id: string;
  name: string;
  status: string;
  offersCount: number;
  bookingsCount: number;
  conversionRate: number;
  avgResponseHours: number | null;
  totalRevenue: number;
}

export interface ManagerAnalytics {
  id: string;
  firstName: string;
  lastName: string | null;
  bookingsVerified: number;
  meetingsScheduled: number;
  meetingsCompleted: number;
  avgVerifyHours: number | null;
}

export interface AnalyticsQuery {
  from: string;
  to: string;
}
