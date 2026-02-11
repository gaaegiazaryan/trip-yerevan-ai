export interface TravelerListItem {
  id: string;
  telegramId: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  preferredLanguage: string;
  vip: boolean;
  blacklisted: boolean;
  blacklistReason: string | null;
  createdAt: string;
  _count: {
    travelRequests: number;
    bookings: number;
  };
}

export interface TravelerDetail extends TravelerListItem {
  role: string;
  status: string;
  travelRequests: {
    id: string;
    status: string;
    destination: string | null;
    createdAt: string;
  }[];
  bookings: {
    id: string;
    status: string;
    totalPrice: number;
    currency: string;
    agency: { name: string };
    createdAt: string;
  }[];
}

export interface TravelersQuery {
  q?: string;
  vip?: boolean;
  blacklisted?: boolean;
  page?: number;
  limit?: number;
}

export interface SetVipPayload {
  enabled: boolean;
}

export interface SetBlacklistPayload {
  enabled: boolean;
  reason?: string;
}
