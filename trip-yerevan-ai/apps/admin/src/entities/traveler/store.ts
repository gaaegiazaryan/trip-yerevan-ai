import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import type { PaginationMeta } from '@/shared/api';
import type {
  TravelerListItem,
  TravelerDetail,
  TravelersQuery,
  SetVipPayload,
  SetBlacklistPayload,
} from './types';
import { travelerApi } from './api';

export const useTravelerStore = defineStore('traveler', () => {
  const travelers = ref<TravelerListItem[]>([]);
  const meta = ref<PaginationMeta | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const filters = reactive<TravelersQuery>({
    page: 1,
    limit: 20,
  });

  const currentTraveler = ref<TravelerDetail | null>(null);
  const detailLoading = ref(false);

  async function fetchTravelers() {
    loading.value = true;
    error.value = null;
    try {
      const res = await travelerApi.list(filters);
      if (res.success && res.data) {
        travelers.value = res.data;
        meta.value = res.meta ?? null;
      } else {
        error.value = res.error ?? 'Failed to load travelers.';
      }
    } catch {
      error.value = 'Failed to load travelers.';
    } finally {
      loading.value = false;
    }
  }

  async function fetchTravelerById(id: string) {
    detailLoading.value = true;
    error.value = null;
    try {
      const res = await travelerApi.getById(id);
      if (res.success && res.data) {
        currentTraveler.value = res.data;
      } else {
        error.value = res.error ?? 'Traveler not found.';
      }
    } catch {
      error.value = 'Failed to load traveler details.';
    } finally {
      detailLoading.value = false;
    }
  }

  async function setVip(id: string, payload: SetVipPayload) {
    const res = await travelerApi.setVip(id, payload);
    if (res.success) {
      ElMessage.success(res.data?.message ?? 'VIP updated.');
      await fetchTravelers();
      if (currentTraveler.value?.id === id) {
        await fetchTravelerById(id);
      }
    } else {
      ElMessage.error(res.error ?? 'Failed to update VIP.');
    }
    return res;
  }

  async function setBlacklist(id: string, payload: SetBlacklistPayload) {
    const res = await travelerApi.setBlacklist(id, payload);
    if (res.success) {
      ElMessage.success(res.data?.message ?? 'Blacklist updated.');
      await fetchTravelers();
      if (currentTraveler.value?.id === id) {
        await fetchTravelerById(id);
      }
    } else {
      ElMessage.error(res.error ?? 'Failed to update blacklist.');
    }
    return res;
  }

  function setPage(page: number) {
    filters.page = page;
    fetchTravelers();
  }

  function setPageSize(size: number) {
    filters.limit = size;
    filters.page = 1;
    fetchTravelers();
  }

  function setFilters(newFilters: Partial<TravelersQuery>) {
    Object.assign(filters, newFilters, { page: 1 });
    fetchTravelers();
  }

  function resetFilters() {
    filters.q = undefined;
    filters.vip = undefined;
    filters.blacklisted = undefined;
    filters.page = 1;
    fetchTravelers();
  }

  return {
    travelers,
    meta,
    loading,
    error,
    filters,
    currentTraveler,
    detailLoading,
    fetchTravelers,
    fetchTravelerById,
    setVip,
    setBlacklist,
    setPage,
    setPageSize,
    setFilters,
    resetFilters,
  };
});
