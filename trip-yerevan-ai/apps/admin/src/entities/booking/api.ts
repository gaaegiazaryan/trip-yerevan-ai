import { http, type ApiResponse } from '@/shared/api';
import type {
  BookingListItem,
  BookingDetail,
  BookingsQuery,
  VerifyBookingPayload,
  KanbanQuery,
  KanbanColumns,
  AssignManagerPayload,
  SetStatusPayload,
  RescheduleProposalPayload,
} from './types';

export const bookingApi = {
  async list(query: BookingsQuery): Promise<ApiResponse<BookingListItem[]>> {
    const { data } = await http.get<ApiResponse<BookingListItem[]>>(
      '/admin/bookings',
      { params: query },
    );
    return data;
  },

  async getById(id: string): Promise<ApiResponse<BookingDetail>> {
    const { data } = await http.get<ApiResponse<BookingDetail>>(
      `/admin/bookings/${id}`,
    );
    return data;
  },

  async verify(
    id: string,
    payload: VerifyBookingPayload,
  ): Promise<ApiResponse<{ message: string; bookingId: string; status: string }>> {
    const { data } = await http.post(`/admin/bookings/${id}/verify`, payload);
    return data;
  },

  async kanban(query: KanbanQuery): Promise<ApiResponse<KanbanColumns>> {
    const { data } = await http.get<ApiResponse<KanbanColumns>>(
      '/admin/bookings/kanban',
      { params: query },
    );
    return data;
  },

  async assignManager(
    id: string,
    payload: AssignManagerPayload,
  ): Promise<ApiResponse<{ message: string; bookingId: string }>> {
    const { data } = await http.post(
      `/admin/bookings/${id}/assign-manager`,
      payload,
    );
    return data;
  },

  async setStatus(
    id: string,
    payload: SetStatusPayload,
  ): Promise<ApiResponse<{ message: string; bookingId: string; status: string }>> {
    const { data } = await http.post(
      `/admin/bookings/${id}/set-status`,
      payload,
    );
    return data;
  },

  async rescheduleProposal(
    id: string,
    payload: RescheduleProposalPayload,
  ): Promise<ApiResponse<{ message: string; bookingId: string }>> {
    const { data } = await http.post(
      `/admin/bookings/${id}/reschedule-proposal`,
      payload,
    );
    return data;
  },
};
