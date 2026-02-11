<script setup lang="ts">
import type { OverviewAnalytics } from '@/entities/analytics';
import { formatPrice } from '@/shared/lib';

defineProps<{
  data: OverviewAnalytics | null;
}>();
</script>

<template>
  <el-row :gutter="16" class="summary-cards">
    <el-col :span="6">
      <el-card shadow="never">
        <el-statistic title="Travel Requests" :value="data?.funnel.travelRequests ?? 0" />
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="never">
        <el-statistic title="Active Bookings" :value="data?.funnel.withBookings ?? 0" />
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="never">
        <el-statistic title="Revenue">
          <template #default>
            <span class="summary-cards__revenue">
              {{ formatPrice(data?.revenue.total ?? 0) }}
            </span>
          </template>
        </el-statistic>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="never">
        <el-statistic title="Avg Deal Value">
          <template #default>
            <span class="summary-cards__revenue">
              {{ formatPrice(data?.revenue.average ?? 0) }}
            </span>
          </template>
        </el-statistic>
      </el-card>
    </el-col>
  </el-row>
</template>

<style scoped>
.summary-cards {
  margin-bottom: 16px;
}
.summary-cards__revenue {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
}
</style>
