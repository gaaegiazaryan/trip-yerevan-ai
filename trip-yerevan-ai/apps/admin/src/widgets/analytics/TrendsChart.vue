<script setup lang="ts">
import { computed } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { OverviewAnalytics } from '@/entities/analytics';

use([LineChart, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer]);

const props = defineProps<{
  data: OverviewAnalytics | null;
}>();

const option = computed(() => {
  const trends = props.data?.trends ?? [];

  return {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: 40, right: 20, top: 20, bottom: 40 },
    xAxis: {
      type: 'category',
      data: trends.map((t) => t.date),
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        name: 'Travel Requests',
        type: 'line',
        smooth: true,
        data: trends.map((t) => t.travelRequests),
        itemStyle: { color: '#409EFF' },
      },
      {
        name: 'Offers',
        type: 'line',
        smooth: true,
        data: trends.map((t) => t.offers),
        itemStyle: { color: '#67C23A' },
      },
      {
        name: 'Bookings',
        type: 'line',
        smooth: true,
        data: trends.map((t) => t.bookings),
        itemStyle: { color: '#E6A23C' },
      },
    ],
  };
});
</script>

<template>
  <el-card shadow="never" header="Daily Trends">
    <VChart :option="option" style="height: 350px" autoresize />
  </el-card>
</template>
