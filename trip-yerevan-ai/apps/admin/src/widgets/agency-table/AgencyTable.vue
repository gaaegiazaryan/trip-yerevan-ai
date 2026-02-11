<script setup lang="ts">
import { DataTable, StatusBadge } from '@/shared/ui';
import { formatDate, shortId } from '@/shared/lib';
import type { AgencyListItem } from '@/entities/agency';
import type { PaginationMeta } from '@/shared/api';

defineProps<{
  agencies: AgencyListItem[];
  loading: boolean;
  meta: PaginationMeta | null;
}>();

const emit = defineEmits<{
  'page-change': [page: number];
  'size-change': [size: number];
  select: [agency: AgencyListItem];
}>();
</script>

<template>
  <DataTable
    :data="agencies"
    :loading="loading"
    :meta="meta"
    @page-change="emit('page-change', $event)"
    @size-change="emit('size-change', $event)"
  >
    <el-table-column label="Name" min-width="180">
      <template #default="{ row }">
        <el-link type="primary" @click="emit('select', row)">
          {{ row.name }}
        </el-link>
        <el-tag
          v-if="row.trustBadge"
          type="success"
          size="small"
          effect="plain"
          round
          style="margin-left: 6px"
        >
          Trusted
        </el-tag>
      </template>
    </el-table-column>

    <el-table-column label="Status" width="130">
      <template #default="{ row }">
        <StatusBadge :status="row.status" type="agency" />
      </template>
    </el-table-column>

    <el-table-column label="Offers" width="90" align="center">
      <template #default="{ row }">
        {{ row._count.offers }}
      </template>
    </el-table-column>

    <el-table-column label="Bookings" width="100" align="center">
      <template #default="{ row }">
        {{ row._count.bookings }}
      </template>
    </el-table-column>

    <el-table-column label="Members" width="100" align="center">
      <template #default="{ row }">
        {{ row._count.memberships }}
      </template>
    </el-table-column>

    <el-table-column label="Regions" min-width="140">
      <template #default="{ row }">
        {{ row.regions.length ? row.regions.join(', ') : '—' }}
      </template>
    </el-table-column>

    <el-table-column label="Created" width="130">
      <template #default="{ row }">
        {{ formatDate(row.createdAt) }}
      </template>
    </el-table-column>

    <el-table-column label="Actions" width="100" fixed="right" align="center">
      <template #default="{ row }">
        <el-button size="small" @click.stop="emit('select', row)">
          View
        </el-button>
      </template>
    </el-table-column>
  </DataTable>
</template>
