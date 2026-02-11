import { http, type ApiResponse } from '@/shared/api';
import type {
  OverviewAnalytics,
  AgencyAnalytics,
  ManagerAnalytics,
  AnalyticsQuery,
} from './types';

export const analyticsApi = {
  async getOverview(
    query: AnalyticsQuery,
  ): Promise<ApiResponse<OverviewAnalytics>> {
    const { data } = await http.get<ApiResponse<OverviewAnalytics>>(
      '/admin/analytics/overview',
      { params: query },
    );
    return data;
  },

  async getAgencies(
    query: AnalyticsQuery,
  ): Promise<ApiResponse<AgencyAnalytics[]>> {
    const { data } = await http.get<ApiResponse<AgencyAnalytics[]>>(
      '/admin/analytics/agencies',
      { params: query },
    );
    return data;
  },

  async getManagers(
    query: AnalyticsQuery,
  ): Promise<ApiResponse<ManagerAnalytics[]>> {
    const { data } = await http.get<ApiResponse<ManagerAnalytics[]>>(
      '/admin/analytics/managers',
      { params: query },
    );
    return data;
  },
};
