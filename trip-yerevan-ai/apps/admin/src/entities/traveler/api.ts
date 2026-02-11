import { http, type ApiResponse } from '@/shared/api';
import type {
  TravelerListItem,
  TravelerDetail,
  TravelersQuery,
  SetVipPayload,
  SetBlacklistPayload,
} from './types';

export const travelerApi = {
  async list(query: TravelersQuery): Promise<ApiResponse<TravelerListItem[]>> {
    const { data } = await http.get<ApiResponse<TravelerListItem[]>>(
      '/admin/travelers',
      { params: query },
    );
    return data;
  },

  async getById(id: string): Promise<ApiResponse<TravelerDetail>> {
    const { data } = await http.get<ApiResponse<TravelerDetail>>(
      `/admin/travelers/${id}`,
    );
    return data;
  },

  async setVip(
    id: string,
    payload: SetVipPayload,
  ): Promise<ApiResponse<{ message: string; userId: string; vip: boolean }>> {
    const { data } = await http.post(
      `/admin/travelers/${id}/vip`,
      payload,
    );
    return data;
  },

  async setBlacklist(
    id: string,
    payload: SetBlacklistPayload,
  ): Promise<ApiResponse<{ message: string; userId: string; blacklisted: boolean }>> {
    const { data } = await http.post(
      `/admin/travelers/${id}/blacklist`,
      payload,
    );
    return data;
  },
};
