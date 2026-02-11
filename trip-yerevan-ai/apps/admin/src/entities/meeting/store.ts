import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import type { PaginationMeta } from '@/shared/api';
import type {
  MeetingListItem,
  MeetingsQuery,
  CounterProposePayload,
  CompleteMeetingPayload,
  CancelMeetingPayload,
} from './types';
import { meetingApi } from './api';

export const useMeetingStore = defineStore('meeting', () => {
  const meetings = ref<MeetingListItem[]>([]);
  const meta = ref<PaginationMeta | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const filters = reactive<MeetingsQuery>({
    page: 1,
    limit: 20,
  });

  async function fetchMeetings() {
    loading.value = true;
    error.value = null;
    try {
      const res = await meetingApi.list(filters);
      if (res.success && res.data) {
        meetings.value = res.data;
        meta.value = res.meta ?? null;
      } else {
        error.value = res.error ?? 'Failed to load meetings.';
      }
    } catch {
      error.value = 'Failed to load meetings.';
    } finally {
      loading.value = false;
    }
  }

  async function confirmMeeting(bookingId: string) {
    const res = await meetingApi.confirm(bookingId);
    if (res.success) await fetchMeetings();
    return res;
  }

  async function counterPropose(bookingId: string, payload: CounterProposePayload) {
    const res = await meetingApi.counterPropose(bookingId, payload);
    if (res.success) await fetchMeetings();
    return res;
  }

  async function completeMeeting(bookingId: string, payload: CompleteMeetingPayload) {
    const res = await meetingApi.complete(bookingId, payload);
    if (res.success) await fetchMeetings();
    return res;
  }

  async function cancelMeeting(bookingId: string, payload: CancelMeetingPayload) {
    const res = await meetingApi.cancel(bookingId, payload);
    if (res.success) await fetchMeetings();
    return res;
  }

  function setPage(page: number) {
    filters.page = page;
    fetchMeetings();
  }

  function setPageSize(size: number) {
    filters.limit = size;
    filters.page = 1;
    fetchMeetings();
  }

  return {
    meetings,
    meta,
    loading,
    error,
    filters,
    fetchMeetings,
    confirmMeeting,
    counterPropose,
    completeMeeting,
    cancelMeeting,
    setPage,
    setPageSize,
  };
});
