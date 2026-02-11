<script setup lang="ts">
import { computed } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { FunnelChart as EFunnelChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { OverviewAnalytics } from '@/entities/analytics';

use([EFunnelChart, TooltipComponent, LegendComponent, CanvasRenderer]);

const props = defineProps<{
  data: OverviewAnalytics | null;
}>();

const option = computed(() => {
  const funnel = props.data?.funnel;
  if (!funnel) return {};

  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c}' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'funnel',
        left: '10%',
        top: 20,
        bottom: 40,
        width: '80%',
        min: 0,
        max: Math.max(funnel.travelRequests, 1),
        sort: 'descending',
        gap: 2,
        label: { show: true, position: 'inside', formatter: '{b}\n{c}' },
        data: [
          { value: funnel.travelRequests, name: 'RFQs' },
          { value: funnel.withOffers, name: 'With Offers' },
          { value: funnel.withBookings, name: 'Bookings' },
          { value: funnel.withMeetings, name: 'Meetings' },
          { value: funnel.paid, name: 'Paid' },
          { value: funnel.completed, name: 'Completed' },
        ],
      },
    ],
  };
});
</script>

<template>
  <el-card shadow="never" header="Conversion Funnel">
    <VChart :option="option" style="height: 350px" autoresize />
  </el-card>
</template>
