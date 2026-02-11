<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { PageHeader } from '@/shared/ui';
import { AgencyStatus } from '@/shared/lib';
import { useAgencyStore, type AgencyListItem } from '@/entities/agency';
import { AgencyTable } from '@/widgets/agency-table';
import AgencyDetailDrawer from './AgencyDetailDrawer.vue';

const store = useAgencyStore();

const drawerVisible = ref(false);

const statusOptions = computed(() =>
  Object.values(AgencyStatus).map((s) => ({ label: s.replace(/_/g, ' '), value: s })),
);

function openDrawer(agency: AgencyListItem) {
  store.fetchAgencyById(agency.id);
  store.performance = null;
  drawerVisible.value = true;
}

function loadPerformance() {
  if (store.currentAgency) {
    store.fetchPerformance(store.currentAgency.id);
  }
}

onMounted(() => {
  store.fetchAgencies();
});
</script>

<template>
  <div class="agencies-page">
    <PageHeader title="Agencies" subtitle="Manage and verify travel agencies">
      <template #actions>
        <el-button @click="store.resetFilters()">Reset Filters</el-button>
        <el-button type="primary" @click="store.fetchAgencies()">Refresh</el-button>
      </template>
    </PageHeader>

    <!-- Filters -->
    <el-card shadow="never" class="agencies-page__filters">
      <el-form inline>
        <el-form-item label="Status">
          <el-select
            v-model="store.filters.status"
            clearable
            placeholder="All statuses"
            style="width: 200px"
            @change="store.setFilters({ status: store.filters.status })"
          >
            <el-option
              v-for="opt in statusOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Search">
          <el-input
            v-model="store.filters.q"
            clearable
            placeholder="Name, email, phone"
            style="width: 220px"
            @clear="store.setFilters({ q: undefined })"
            @keyup.enter="store.setFilters({ q: store.filters.q })"
          />
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Table -->
    <AgencyTable
      :agencies="store.agencies"
      :loading="store.loading"
      :meta="store.meta"
      @page-change="store.setPage($event)"
      @size-change="store.setPageSize($event)"
      @select="openDrawer($event)"
    />

    <!-- Detail Drawer -->
    <AgencyDetailDrawer
      :agency="store.currentAgency"
      :visible="drawerVisible"
      :loading="store.detailLoading"
      :performance="store.performance"
      :performance-loading="store.performanceLoading"
      @update:visible="drawerVisible = $event"
      @verify="store.verifyAgency(store.currentAgency!.id, $event)"
      @toggle-badge="store.setTrustBadge(store.currentAgency!.id, { enabled: $event })"
      @load-performance="loadPerformance()"
    />
  </div>
</template>

<style scoped>
.agencies-page__filters {
  margin-bottom: 16px;
}
</style>
