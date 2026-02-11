import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import type { PaginationMeta } from '@/shared/api';
import type {
  BookingListItem,
  BookingDetail,
  BookingsQuery,
  VerifyBookingPayload,
  KanbanQuery,
  KanbanColumns,
  SetStatusPayload,
  AssignManagerPayload,
  RescheduleProposalPayload,
} from './types';
import { bookingApi } from './api';

export const useBookingStore = defineStore('booking', () => {
  // List state
  const bookings = ref<BookingListItem[]>([]);
  const meta = ref<PaginationMeta | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const filters = reactive<BookingsQuery>({
    page: 1,
    limit: 20,
  });

  // Detail state
  const currentBooking = ref<BookingDetail | null>(null);
  const detailLoading = ref(false);

  // Kanban state
  const kanbanColumns = ref<KanbanColumns>({});
  const kanbanLoading = ref(false);
  const kanbanError = ref<string | null>(null);
  const kanbanFilters = reactive<KanbanQuery>({});

  async function fetchBookings() {
    loading.value = true;
    error.value = null;
    try {
      const res = await bookingApi.list(filters);
      if (res.success && res.data) {
        bookings.value = res.data;
        meta.value = res.meta ?? null;
      } else {
        error.value = res.error ?? 'Failed to load bookings.';
      }
    } catch {
      error.value = 'Failed to load bookings.';
    } finally {
      loading.value = false;
    }
  }

  async function fetchBookingById(id: string) {
    detailLoading.value = true;
    error.value = null;
    try {
      const res = await bookingApi.getById(id);
      if (res.success && res.data) {
        currentBooking.value = res.data;
      } else {
        error.value = res.error ?? 'Booking not found.';
      }
    } catch {
      error.value = 'Failed to load booking details.';
    } finally {
      detailLoading.value = false;
    }
  }

  async function verifyBooking(id: string, payload: VerifyBookingPayload) {
    const res = await bookingApi.verify(id, payload);
    if (res.success) {
      // Refresh both list and detail
      await Promise.all([
        fetchBookings(),
        currentBooking.value?.id === id ? fetchBookingById(id) : Promise.resolve(),
      ]);
    }
    return res;
  }

  function setPage(page: number) {
    filters.page = page;
    fetchBookings();
  }

  function setPageSize(size: number) {
    filters.limit = size;
    filters.page = 1;
    fetchBookings();
  }

  function setFilters(newFilters: Partial<BookingsQuery>) {
    Object.assign(filters, newFilters, { page: 1 });
    fetchBookings();
  }

  function resetFilters() {
    filters.status = undefined;
    filters.dateFrom = undefined;
    filters.dateTo = undefined;
    filters.q = undefined;
    filters.page = 1;
    fetchBookings();
  }

  // Kanban actions
  async function fetchKanban() {
    kanbanLoading.value = true;
    kanbanError.value = null;
    try {
      const res = await bookingApi.kanban(kanbanFilters);
      if (res.success && res.data) {
        kanbanColumns.value = res.data;
      } else {
        kanbanError.value = res.error ?? 'Failed to load pipeline.';
      }
    } catch {
      kanbanError.value = 'Failed to load pipeline.';
    } finally {
      kanbanLoading.value = false;
    }
  }

  function setKanbanFilters(newFilters: Partial<KanbanQuery>) {
    Object.assign(kanbanFilters, newFilters);
    fetchKanban();
  }

  function resetKanbanFilters() {
    kanbanFilters.from = undefined;
    kanbanFilters.to = undefined;
    kanbanFilters.q = undefined;
    kanbanFilters.managerId = undefined;
    fetchKanban();
  }

  async function assignManager(bookingId: string, payload: AssignManagerPayload) {
    const res = await bookingApi.assignManager(bookingId, payload);
    if (res.success) {
      await fetchKanban();
    }
    return res;
  }

  async function setBookingStatus(bookingId: string, payload: SetStatusPayload) {
    const res = await bookingApi.setStatus(bookingId, payload);
    if (res.success) {
      await Promise.all([
        fetchKanban(),
        currentBooking.value?.id === bookingId
          ? fetchBookingById(bookingId)
          : Promise.resolve(),
      ]);
    }
    return res;
  }

  async function rescheduleProposal(bookingId: string, payload: RescheduleProposalPayload) {
    const res = await bookingApi.rescheduleProposal(bookingId, payload);
    if (res.success) {
      await fetchKanban();
    }
    return res;
  }

  return {
    // State
    bookings,
    meta,
    loading,
    error,
    filters,
    currentBooking,
    detailLoading,
    // Kanban state
    kanbanColumns,
    kanbanLoading,
    kanbanError,
    kanbanFilters,
    // Actions
    fetchBookings,
    fetchBookingById,
    verifyBooking,
    setPage,
    setPageSize,
    setFilters,
    resetFilters,
    // Kanban actions
    fetchKanban,
    setKanbanFilters,
    resetKanbanFilters,
    assignManager,
    setBookingStatus,
    rescheduleProposal,
  };
});
