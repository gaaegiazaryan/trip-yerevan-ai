<script setup lang="ts">
import type { ManagerAnalytics } from '@/entities/analytics';

defineProps<{
  data: ManagerAnalytics[];
}>();

function formatHours(hours: number | null): string {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}
</script>

<template>
  <el-card shadow="never" header="Manager Performance">
    <el-table :data="data" stripe>
      <el-table-column label="Manager" min-width="150">
        <template #default="{ row }">
          {{ row.firstName }} {{ row.lastName ?? '' }}
        </template>
      </el-table-column>
      <el-table-column
        prop="bookingsVerified"
        label="Verified"
        width="100"
        align="center"
      />
      <el-table-column
        prop="meetingsScheduled"
        label="Scheduled"
        width="110"
        align="center"
      />
      <el-table-column
        prop="meetingsCompleted"
        label="Completed"
        width="110"
        align="center"
      />
      <el-table-column label="Avg Verify Time" width="140" align="center">
        <template #default="{ row }">{{ formatHours(row.avgVerifyHours) }}</template>
      </el-table-column>
    </el-table>
  </el-card>
</template>
