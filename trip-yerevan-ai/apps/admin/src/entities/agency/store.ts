import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import type { PaginationMeta } from '@/shared/api';
import type {
  AgencyListItem,
  AgencyDetail,
  AgenciesQuery,
  VerifyAgencyPayload,
  TrustBadgePayload,
  AgencyPerformance,
  PerformanceQuery,
} from './types';
import { agencyApi } from './api';

export const useAgencyStore = defineStore('agency', () => {
  const agencies = ref<AgencyListItem[]>([]);
  const meta = ref<PaginationMeta | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const filters = reactive<AgenciesQuery>({
    page: 1,
    limit: 20,
  });

  const currentAgency = ref<AgencyDetail | null>(null);
  const detailLoading = ref(false);

  const performance = ref<AgencyPerformance | null>(null);
  const performanceLoading = ref(false);

  async function fetchAgencies() {
    loading.value = true;
    error.value = null;
    try {
      const res = await agencyApi.list(filters);
      if (res.success && res.data) {
        agencies.value = res.data;
        meta.value = res.meta ?? null;
      } else {
        error.value = res.error ?? 'Failed to load agencies.';
      }
    } catch {
      error.value = 'Failed to load agencies.';
    } finally {
      loading.value = false;
    }
  }

  async function fetchAgencyById(id: string) {
    detailLoading.value = true;
    error.value = null;
    try {
      const res = await agencyApi.getById(id);
      if (res.success && res.data) {
        currentAgency.value = res.data;
      } else {
        error.value = res.error ?? 'Agency not found.';
      }
    } catch {
      error.value = 'Failed to load agency details.';
    } finally {
      detailLoading.value = false;
    }
  }

  async function fetchPerformance(id: string, query?: PerformanceQuery) {
    performanceLoading.value = true;
    try {
      const res = await agencyApi.getPerformance(id, query);
      if (res.success && res.data) {
        performance.value = res.data;
      } else {
        performance.value = null;
      }
    } catch {
      performance.value = null;
    } finally {
      performanceLoading.value = false;
    }
  }

  async function verifyAgency(id: string, payload: VerifyAgencyPayload) {
    const res = await agencyApi.verify(id, payload);
    if (res.success) {
      ElMessage.success(res.data?.message ?? 'Action completed.');
      await fetchAgencies();
      if (currentAgency.value?.id === id) {
        await fetchAgencyById(id);
      }
    } else {
      ElMessage.error(res.error ?? 'Action failed.');
    }
    return res;
  }

  async function setTrustBadge(id: string, payload: TrustBadgePayload) {
    const res = await agencyApi.setTrustBadge(id, payload);
    if (res.success) {
      ElMessage.success(res.data?.message ?? 'Trust badge updated.');
      await fetchAgencies();
      if (currentAgency.value?.id === id) {
        await fetchAgencyById(id);
      }
    } else {
      ElMessage.error(res.error ?? 'Failed to update trust badge.');
    }
    return res;
  }

  function setPage(page: number) {
    filters.page = page;
    fetchAgencies();
  }

  function setPageSize(size: number) {
    filters.limit = size;
    filters.page = 1;
    fetchAgencies();
  }

  function setFilters(newFilters: Partial<AgenciesQuery>) {
    Object.assign(filters, newFilters, { page: 1 });
    fetchAgencies();
  }

  function resetFilters() {
    filters.status = undefined;
    filters.q = undefined;
    filters.page = 1;
    fetchAgencies();
  }

  return {
    agencies,
    meta,
    loading,
    error,
    filters,
    currentAgency,
    detailLoading,
    performance,
    performanceLoading,
    fetchAgencies,
    fetchAgencyById,
    fetchPerformance,
    verifyAgency,
    setTrustBadge,
    setPage,
    setPageSize,
    setFilters,
    resetFilters,
  };
});
