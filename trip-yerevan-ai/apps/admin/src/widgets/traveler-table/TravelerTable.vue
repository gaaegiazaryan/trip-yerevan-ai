<script setup lang="ts">
import { DataTable } from '@/shared/ui';
import { formatDate } from '@/shared/lib';
import type { TravelerListItem } from '@/entities/traveler';
import type { PaginationMeta } from '@/shared/api';

defineProps<{
  travelers: TravelerListItem[];
  loading: boolean;
  meta: PaginationMeta | null;
}>();

const emit = defineEmits<{
  'page-change': [page: number];
  'size-change': [size: number];
  select: [traveler: TravelerListItem];
}>();
</script>

<template>
  <DataTable
    :data="travelers"
    :loading="loading"
    :meta="meta"
    @page-change="emit('page-change', $event)"
    @size-change="emit('size-change', $event)"
  >
    <el-table-column label="Name" min-width="160">
      <template #default="{ row }">
        <el-link type="primary" @click="emit('select', row)">
          {{ row.firstName }} {{ row.lastName ?? '' }}
        </el-link>
        <el-tag v-if="row.vip" type="warning" size="small" style="margin-left: 6px">
          VIP
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column label="Telegram ID" width="130" prop="telegramId" />
    <el-table-column label="Status" width="120">
      <template #default="{ row }">
        <el-tag v-if="row.blacklisted" type="danger" size="small">
          Blacklisted
        </el-tag>
        <el-tag v-else type="success" size="small">
          Active
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column label="Requests" width="90" align="center">
      <template #default="{ row }">
        {{ row._count.travelRequests }}
      </template>
    </el-table-column>
    <el-table-column label="Bookings" width="90" align="center">
      <template #default="{ row }">
        {{ row._count.bookings }}
      </template>
    </el-table-column>
    <el-table-column label="Language" width="90" prop="preferredLanguage" />
    <el-table-column label="Created" width="120">
      <template #default="{ row }">
        {{ formatDate(row.createdAt) }}
      </template>
    </el-table-column>
  </DataTable>
</template>
