import { http, type ApiResponse } from '@/shared/api';
import type {
  MeetingListItem,
  MeetingsQuery,
  CounterProposePayload,
  CompleteMeetingPayload,
  CancelMeetingPayload,
  CalendarEvent,
  CalendarQuery,
  ReschedulePayload,
} from './types';

export const meetingApi = {
  async list(query: MeetingsQuery): Promise<ApiResponse<MeetingListItem[]>> {
    const { data } = await http.get<ApiResponse<MeetingListItem[]>>(
      '/admin/meetings',
      { params: query },
    );
    return data;
  },

  async confirm(
    bookingId: string,
  ): Promise<ApiResponse<{ message: string; meetingId: string }>> {
    const { data } = await http.post(`/admin/meetings/${bookingId}/confirm`);
    return data;
  },

  async counterPropose(
    bookingId: string,
    payload: CounterProposePayload,
  ): Promise<ApiResponse<{ message: string; proposalId: string }>> {
    const { data } = await http.post(
      `/admin/meetings/${bookingId}/counter-propose`,
      payload,
    );
    return data;
  },

  async complete(
    bookingId: string,
    payload: CompleteMeetingPayload,
  ): Promise<ApiResponse<{ message: string; bookingId: string; status: string }>> {
    const { data } = await http.post(
      `/admin/meetings/${bookingId}/complete`,
      payload,
    );
    return data;
  },

  async cancel(
    bookingId: string,
    payload: CancelMeetingPayload,
  ): Promise<ApiResponse<{ message: string; meetingId: string }>> {
    const { data } = await http.post(
      `/admin/meetings/${bookingId}/cancel`,
      payload,
    );
    return data;
  },

  async calendarEvents(
    query: CalendarQuery,
  ): Promise<ApiResponse<CalendarEvent[]>> {
    const { data } = await http.get<ApiResponse<CalendarEvent[]>>(
      '/admin/calendar',
      { params: query },
    );
    return data;
  },

  async reschedule(
    bookingId: string,
    payload: ReschedulePayload,
  ): Promise<ApiResponse<{ message: string; meetingId: string; bookingId: string }>> {
    const { data } = await http.post(
      `/admin/calendar/${bookingId}/reschedule`,
      payload,
    );
    return data;
  },
};
