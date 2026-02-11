<script setup lang="ts">
import { onMounted, watch, ref } from 'vue';
import { PageHeader } from '@/shared/ui';
import { useAnalyticsStore } from '@/entities/analytics';
import {
  SummaryCards,
  FunnelChart,
  TrendsChart,
  AgencyRankingTable,
  ManagerPerformanceTable,
} from '@/widgets/analytics';

const store = useAnalyticsStore();

const dateRange = ref<[string, string]>([store.dateRange.from, store.dateRange.to]);

function onDateChange(val: [string, string] | null) {
  if (val) {
    store.setDateRange(val[0], val[1]);
  }
}

watch(
  () => store.dateRange,
  () => {
    store.fetchAll();
  },
);

onMounted(() => {
  store.fetchAll();
});
</script>

<template>
  <div class="analytics-page">
    <PageHeader title="Analytics" subtitle="Marketplace performance overview">
      <template #actions>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="to"
          start-placeholder="Start date"
          end-placeholder="End date"
          value-format="YYYY-MM-DD"
          @change="onDateChange"
        />
        <el-button
          type="primary"
          :loading="store.loading"
          @click="store.fetchAll()"
        >
          Refresh
        </el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="store.error"
      :title="store.error"
      type="error"
      show-icon
      closable
      style="margin-bottom: 16px"
    />

    <SummaryCards :data="store.overview" />

    <el-row :gutter="16" class="analytics-page__charts">
      <el-col :span="12">
        <FunnelChart :data="store.overview" />
      </el-col>
      <el-col :span="12">
        <TrendsChart :data="store.overview" />
      </el-col>
    </el-row>

    <div class="analytics-page__tables">
      <AgencyRankingTable :data="store.agencies" />
    </div>

    <div class="analytics-page__tables">
      <ManagerPerformanceTable :data="store.managers" />
    </div>
  </div>
</template>

<style scoped>
.analytics-page__charts {
  margin-bottom: 16px;
}
.analytics-page__tables {
  margin-bottom: 16px;
}
</style>
