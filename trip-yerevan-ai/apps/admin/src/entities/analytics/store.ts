import { defineStore } from 'pinia';
import { ref } from 'vue';
import type {
  OverviewAnalytics,
  AgencyAnalytics,
  ManagerAnalytics,
  AnalyticsQuery,
} from './types';
import { analyticsApi } from './api';

export const useAnalyticsStore = defineStore('analytics', () => {
  const overview = ref<OverviewAnalytics | null>(null);
  const agencies = ref<AgencyAnalytics[]>([]);
  const managers = ref<ManagerAnalytics[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const dateRange = ref<{ from: string; to: string }>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });

  async function fetchOverview() {
    const res = await analyticsApi.getOverview(dateRange.value);
    if (res.success && res.data) {
      overview.value = res.data;
    }
    return res;
  }

  async function fetchAgencies() {
    const res = await analyticsApi.getAgencies(dateRange.value);
    if (res.success && res.data) {
      agencies.value = res.data;
    }
    return res;
  }

  async function fetchManagers() {
    const res = await analyticsApi.getManagers(dateRange.value);
    if (res.success && res.data) {
      managers.value = res.data;
    }
    return res;
  }

  async function fetchAll() {
    loading.value = true;
    error.value = null;
    try {
      const [overviewRes, agenciesRes, managersRes] = await Promise.all([
        fetchOverview(),
        fetchAgencies(),
        fetchManagers(),
      ]);

      // Surface first API-level error (fail() response)
      const firstError = [overviewRes, agenciesRes, managersRes].find(
        (r) => !r.success,
      );
      if (firstError?.error) {
        error.value = firstError.error;
      }
    } catch {
      error.value = 'Failed to load analytics data.';
    } finally {
      loading.value = false;
    }
  }

  function setDateRange(from: string, to: string) {
    dateRange.value = { from, to };
  }

  return {
    overview,
    agencies,
    managers,
    loading,
    error,
    dateRange,
    fetchOverview,
    fetchAgencies,
    fetchManagers,
    fetchAll,
    setDateRange,
  };
});
