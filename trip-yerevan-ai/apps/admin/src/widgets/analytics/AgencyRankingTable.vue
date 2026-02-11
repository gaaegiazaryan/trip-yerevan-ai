<script setup lang="ts">
import type { AgencyAnalytics } from '@/entities/analytics';
import { formatPrice } from '@/shared/lib';

defineProps<{
  data: AgencyAnalytics[];
}>();

function formatHours(hours: number | null): string {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}
</script>

<template>
  <el-card shadow="never" header="Agency Ranking">
    <el-table :data="data" stripe>
      <el-table-column label="#" width="50">
        <template #default="{ $index }">{{ $index + 1 }}</template>
      </el-table-column>
      <el-table-column prop="name" label="Agency" min-width="150" />
      <el-table-column prop="offersCount" label="Offers" width="90" align="center" />
      <el-table-column prop="bookingsCount" label="Bookings" width="100" align="center" />
      <el-table-column label="Conversion" width="110" align="center">
        <template #default="{ row }">{{ row.conversionRate }}%</template>
      </el-table-column>
      <el-table-column label="Avg Response" width="120" align="center">
        <template #default="{ row }">{{ formatHours(row.avgResponseHours) }}</template>
      </el-table-column>
      <el-table-column label="Revenue" width="140" align="right">
        <template #default="{ row }">{{ formatPrice(row.totalRevenue) }}</template>
      </el-table-column>
    </el-table>
  </el-card>
</template>
