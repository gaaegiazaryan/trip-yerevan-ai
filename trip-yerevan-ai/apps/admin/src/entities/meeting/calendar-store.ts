import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { CalendarEvent, CalendarQuery, ReschedulePayload } from './types';
import { meetingApi } from './api';

export const useCalendarStore = defineStore('calendar', () => {
  const events = ref<CalendarEvent[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const currentRange = ref<{ from: string; to: string } | null>(null);

  async function fetchEvents(query: CalendarQuery) {
    loading.value = true;
    error.value = null;
    currentRange.value = { from: query.from, to: query.to };
    try {
      const res = await meetingApi.calendarEvents(query);
      if (res.success && res.data) {
        events.value = res.data;
      } else {
        error.value = res.error ?? 'Failed to load calendar events.';
      }
    } catch {
      error.value = 'Failed to load calendar events.';
    } finally {
      loading.value = false;
    }
  }

  async function rescheduleMeeting(bookingId: string, payload: ReschedulePayload) {
    const res = await meetingApi.reschedule(bookingId, payload);
    if (res.success && currentRange.value) {
      await fetchEvents(currentRange.value);
    }
    return res;
  }

  return {
    events,
    loading,
    error,
    currentRange,
    fetchEvents,
    rescheduleMeeting,
  };
});
