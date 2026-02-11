import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import type { PaginationMeta } from '@/shared/api';
import type { RiskEvent, RiskEventsQuery } from './types';
import { riskApi } from './api';

export const useRiskStore = defineStore('risk', () => {
  const events = ref<RiskEvent[]>([]);
  const meta = ref<PaginationMeta | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const filters = reactive<RiskEventsQuery>({
    page: 1,
    limit: 20,
  });

  const currentEvent = ref<RiskEvent | null>(null);
  const detailLoading = ref(false);

  async function fetchEvents() {
    loading.value = true;
    error.value = null;
    try {
      const res = await riskApi.list(filters);
      if (res.success && res.data) {
        events.value = res.data;
        meta.value = res.meta ?? null;
      } else {
        error.value = res.error ?? 'Failed to load risk events.';
      }
    } catch {
      error.value = 'Failed to load risk events.';
    } finally {
      loading.value = false;
    }
  }

  async function fetchEventById(id: string) {
    detailLoading.value = true;
    error.value = null;
    try {
      const res = await riskApi.getById(id);
      if (res.success && res.data) {
        currentEvent.value = res.data;
      } else {
        error.value = res.error ?? 'Event not found.';
      }
    } catch {
      error.value = 'Failed to load risk event details.';
    } finally {
      detailLoading.value = false;
    }
  }

  function setPage(page: number) {
    filters.page = page;
    fetchEvents();
  }

  function setPageSize(size: number) {
    filters.limit = size;
    filters.page = 1;
    fetchEvents();
  }

  function setFilters(newFilters: Partial<RiskEventsQuery>) {
    Object.assign(filters, newFilters, { page: 1 });
    fetchEvents();
  }

  function resetFilters() {
    filters.severity = undefined;
    filters.entityType = undefined;
    filters.page = 1;
    fetchEvents();
  }

  return {
    events,
    meta,
    loading,
    error,
    filters,
    currentEvent,
    detailLoading,
    fetchEvents,
    fetchEventById,
    setPage,
    setPageSize,
    setFilters,
    resetFilters,
  };
});
