<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { PageHeader } from '@/shared/ui';
import {
  formatDateTime,
  RISK_SEVERITY_LABELS,
  RISK_SEVERITY_COLORS,
  RISK_ENTITY_TYPE_LABELS,
} from '@/shared/lib';
import { useRiskStore, type RiskEvent } from '@/entities/risk';
import RiskEventDetailDrawer from './RiskEventDetailDrawer.vue';

const store = useRiskStore();
const drawerVisible = ref(false);

function openDrawer(event: RiskEvent) {
  store.fetchEventById(event.id);
  drawerVisible.value = true;
}

onMounted(() => {
  store.fetchEvents();
});
</script>

<template>
  <div class="risk-page">
    <PageHeader title="Risk Center" subtitle="Security events and audit trail">
      <template #actions>
        <el-button @click="store.resetFilters()">Reset Filters</el-button>
        <el-button type="primary" @click="store.fetchEvents()">Refresh</el-button>
      </template>
    </PageHeader>

    <!-- Filters -->
    <el-card shadow="never" class="risk-page__filters">
      <el-form inline>
        <el-form-item label="Severity">
          <el-select
            v-model="store.filters.severity"
            clearable
            placeholder="All"
            style="width: 140px"
            @change="store.setFilters({ severity: store.filters.severity })"
          >
            <el-option label="Low" value="LOW" />
            <el-option label="Medium" value="MED" />
            <el-option label="High" value="HIGH" />
          </el-select>
        </el-form-item>
        <el-form-item label="Entity Type">
          <el-select
            v-model="store.filters.entityType"
            clearable
            placeholder="All"
            style="width: 160px"
            @change="store.setFilters({ entityType: store.filters.entityType })"
          >
            <el-option label="User" value="USER" />
            <el-option label="Agency" value="AGENCY" />
            <el-option label="Proxy Chat" value="PROXY_CHAT" />
            <el-option label="Booking" value="BOOKING" />
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Table -->
    <el-card shadow="never">
      <el-table
        :data="store.events"
        :border="true"
        stripe
        style="width: 100%"
        v-loading="store.loading"
        @row-click="openDrawer"
        row-class-name="risk-page__row"
      >
        <el-table-column label="Severity" width="120">
          <template #default="{ row }">
            <el-tag
              :type="RISK_SEVERITY_COLORS[row.severity] as any"
              size="small"
              effect="dark"
            >
              {{ RISK_SEVERITY_LABELS[row.severity] ?? row.severity }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Entity Type" width="140">
          <template #default="{ row }">
            {{ RISK_ENTITY_TYPE_LABELS[row.entityType] ?? row.entityType }}
          </template>
        </el-table-column>
        <el-table-column label="Entity ID" width="160">
          <template #default="{ row }">
            <span class="risk-page__id">{{ row.entityId.slice(0, 8) }}...</span>
          </template>
        </el-table-column>
        <el-table-column label="Reason" min-width="300">
          <template #default="{ row }">
            {{ row.reason }}
          </template>
        </el-table-column>
        <el-table-column label="Date" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <div v-if="store.meta" class="risk-page__pagination">
        <el-pagination
          :current-page="store.filters.page"
          :page-size="store.filters.limit"
          :total="store.meta.total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="store.setPage($event)"
          @size-change="store.setPageSize($event)"
        />
      </div>
    </el-card>

    <!-- Detail Drawer -->
    <RiskEventDetailDrawer
      :event="store.currentEvent"
      :visible="drawerVisible"
      :loading="store.detailLoading"
      @update:visible="drawerVisible = $event"
    />
  </div>
</template>

<style scoped>
.risk-page__filters {
  margin-bottom: 16px;
}
.risk-page__row {
  cursor: pointer;
}
.risk-page__id {
  font-family: monospace;
  font-size: 12px;
  color: #909399;
}
.risk-page__pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
