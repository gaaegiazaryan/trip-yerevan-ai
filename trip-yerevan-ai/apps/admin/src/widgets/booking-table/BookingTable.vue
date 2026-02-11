<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { DataTable, StatusBadge } from '@/shared/ui';
import { formatDate, formatPrice, shortId } from '@/shared/lib';
import type { BookingListItem } from '@/entities/booking';
import type { PaginationMeta } from '@/shared/api';
import { BookingStatus } from '@/shared/lib';

const props = defineProps<{
  bookings: BookingListItem[];
  loading: boolean;
  meta: PaginationMeta | null;
}>();

const emit = defineEmits<{
  'page-change': [page: number];
  'size-change': [size: number];
  verify: [bookingId: string];
}>();

const router = useRouter();

function goToDetail(row: BookingListItem) {
  router.push({ name: 'booking-detail', params: { id: row.id } });
}

function canVerify(status: BookingStatus): boolean {
  return status === BookingStatus.AGENCY_CONFIRMED;
}
</script>

<template>
  <DataTable
    :data="bookings"
    :loading="loading"
    :meta="meta"
    @page-change="emit('page-change', $event)"
    @size-change="emit('size-change', $event)"
  >
    <el-table-column label="ID" width="100">
      <template #default="{ row }">
        <el-link type="primary" @click="goToDetail(row)">
          {{ shortId(row.id) }}
        </el-link>
      </template>
    </el-table-column>

    <el-table-column label="Status" width="160">
      <template #default="{ row }">
        <StatusBadge :status="row.status" type="booking" />
      </template>
    </el-table-column>

    <el-table-column label="Traveler" min-width="150">
      <template #default="{ row }">
        {{ row.user.firstName }} {{ row.user.lastName ?? '' }}
      </template>
    </el-table-column>

    <el-table-column label="Agency" min-width="140">
      <template #default="{ row }">
        {{ row.agency.name }}
      </template>
    </el-table-column>

    <el-table-column label="Destination" min-width="130">
      <template #default="{ row }">
        {{ row.offer.destination ?? '—' }}
      </template>
    </el-table-column>

    <el-table-column label="Price" width="130" align="right">
      <template #default="{ row }">
        {{ formatPrice(row.totalPrice, row.currency) }}
      </template>
    </el-table-column>

    <el-table-column label="Date" width="130">
      <template #default="{ row }">
        {{ formatDate(row.createdAt) }}
      </template>
    </el-table-column>

    <el-table-column label="Actions" width="140" fixed="right" align="center">
      <template #default="{ row }">
        <el-button
          v-if="canVerify(row.status)"
          type="primary"
          size="small"
          @click.stop="emit('verify', row.id)"
        >
          Verify
        </el-button>
        <el-button
          size="small"
          @click.stop="goToDetail(row)"
        >
          View
        </el-button>
      </template>
    </el-table-column>
  </DataTable>
</template>
