import { http, type ApiResponse } from '@/shared/api';
import type {
  AgencyListItem,
  AgencyDetail,
  AgenciesQuery,
  VerifyAgencyPayload,
  TrustBadgePayload,
  AgencyPerformance,
  PerformanceQuery,
} from './types';

export const agencyApi = {
  async list(query: AgenciesQuery): Promise<ApiResponse<AgencyListItem[]>> {
    const { data } = await http.get<ApiResponse<AgencyListItem[]>>(
      '/admin/agencies',
      { params: query },
    );
    return data;
  },

  async getById(id: string): Promise<ApiResponse<AgencyDetail>> {
    const { data } = await http.get<ApiResponse<AgencyDetail>>(
      `/admin/agencies/${id}`,
    );
    return data;
  },

  async verify(
    id: string,
    payload: VerifyAgencyPayload,
  ): Promise<ApiResponse<{ message: string; agencyId: string; status: string }>> {
    const { data } = await http.post(
      `/admin/agencies/${id}/verify`,
      payload,
    );
    return data;
  },

  async setTrustBadge(
    id: string,
    payload: TrustBadgePayload,
  ): Promise<ApiResponse<{ message: string; agencyId: string; trustBadge: boolean }>> {
    const { data } = await http.post(
      `/admin/agencies/${id}/trust-badge`,
      payload,
    );
    return data;
  },

  async getPerformance(
    id: string,
    query?: PerformanceQuery,
  ): Promise<ApiResponse<AgencyPerformance>> {
    const { data } = await http.get<ApiResponse<AgencyPerformance>>(
      `/admin/agencies/${id}/performance`,
      { params: query },
    );
    return data;
  },
};
