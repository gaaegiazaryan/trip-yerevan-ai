<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { PageHeader } from '@/shared/ui';
import {
  KANBAN_COLUMN_ORDER,
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_COLORS,
  BookingStatus,
} from '@/shared/lib';
import { useBookingStore } from '@/entities/booking';
import { KanbanColumn } from '@/widgets/kanban-board';
import BookingDetailDrawer from './BookingDetailDrawer.vue';

const store = useBookingStore();

const search = ref('');
const dateRange = ref<[string, string] | null>(null);

const drawerVisible = ref(false);
const selectedBookingId = ref<string | null>(null);

const totalCards = computed(() =>
  KANBAN_COLUMN_ORDER.reduce(
    (sum, s) => sum + (store.kanbanColumns[s]?.length ?? 0),
    0,
  ),
);

const COLUMN_HEX_COLORS: Record<string, string> = {
  [BookingStatus.CREATED]: '#909399',
  [BookingStatus.AWAITING_AGENCY_CONFIRMATION]: '#E6A23C',
  [BookingStatus.AGENCY_CONFIRMED]: '#409EFF',
  [BookingStatus.MANAGER_VERIFIED]: '#67C23A',
  [BookingStatus.MEETING_SCHEDULED]: '#E6A23C',
  [BookingStatus.PAYMENT_PENDING]: '#F56C6C',
  [BookingStatus.PAID]: '#67C23A',
  [BookingStatus.IN_PROGRESS]: '#409EFF',
};

function applyFilters() {
  store.setKanbanFilters({
    q: search.value || undefined,
    from: dateRange.value?.[0] || undefined,
    to: dateRange.value?.[1] || undefined,
  });
}

function resetFilters() {
  search.value = '';
  dateRange.value = null;
  store.resetKanbanFilters();
}

function openCard(bookingId: string) {
  selectedBookingId.value = bookingId;
  drawerVisible.value = true;
}

function onStatusChanged() {
  store.fetchKanban();
  if (selectedBookingId.value) {
    store.fetchBookingById(selectedBookingId.value);
  }
}

onMounted(() => {
  store.fetchKanban();
});
</script>

<template>
  <div class="pipeline-page">
    <PageHeader title="Pipeline" :subtitle="`${totalCards} active bookings`">
      <template #actions>
        <el-button @click="store.fetchKanban()" :loading="store.kanbanLoading">
          Refresh
        </el-button>
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="pipeline-page__filters">
      <el-input
        v-model="search"
        placeholder="Search destination, traveler..."
        clearable
        style="width: 260px"
        @keyup.enter="applyFilters"
        @clear="applyFilters"
      />
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="to"
        start-placeholder="From"
        end-placeholder="To"
        format="YYYY-MM-DD"
        value-format="YYYY-MM-DD"
        @change="applyFilters"
      />
      <el-button @click="applyFilters">Apply</el-button>
      <el-button link @click="resetFilters">Reset</el-button>
    </div>

    <!-- Error -->
    <el-alert
      v-if="store.kanbanError"
      type="error"
      :title="store.kanbanError"
      show-icon
      closable
      style="margin-bottom: 16px"
    />

    <!-- Board -->
    <div v-loading="store.kanbanLoading" class="pipeline-page__board">
      <KanbanColumn
        v-for="status in KANBAN_COLUMN_ORDER"
        :key="status"
        :status="status"
        :label="BOOKING_STATUS_LABELS[status]"
        :color="COLUMN_HEX_COLORS[status] ?? '#409EFF'"
        :bookings="store.kanbanColumns[status] ?? []"
        @card-click="openCard"
      />
    </div>

    <!-- Detail Drawer -->
    <BookingDetailDrawer
      :visible="drawerVisible"
      :booking-id="selectedBookingId"
      @update:visible="drawerVisible = $event"
      @status-changed="onStatusChanged"
    />
  </div>
</template>

<style scoped>
.pipeline-page__filters {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.pipeline-page__board {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 16px;
}
</style>
