import { http, type ApiResponse } from '@/shared/api';
import type { RiskEvent, RiskEventsQuery } from './types';

export const riskApi = {
  async list(query: RiskEventsQuery): Promise<ApiResponse<RiskEvent[]>> {
    const { data } = await http.get<ApiResponse<RiskEvent[]>>(
      '/admin/risk/events',
      { params: query },
    );
    return data;
  },

  async getById(id: string): Promise<ApiResponse<RiskEvent>> {
    const { data } = await http.get<ApiResponse<RiskEvent>>(
      `/admin/risk/events/${id}`,
    );
    return data;
  },
};
