<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { PageHeader } from '@/shared/ui';
import { BookingStatus } from '@/shared/lib';
import { useBookingStore } from '@/entities/booking';
import { BookingTable } from '@/widgets/booking-table';
import { useBookingVerify, VerifyDialog } from '@/features/booking-verify';

const store = useBookingStore();
const {
  dialogVisible,
  submitting,
  notes,
  checklist,
  openVerifyDialog,
  closeDialog,
  confirm,
  reject,
} = useBookingVerify();

const statusOptions = computed(() =>
  Object.values(BookingStatus).map((s) => ({ label: s.replace(/_/g, ' '), value: s })),
);

onMounted(() => {
  store.fetchBookings();
});
</script>

<template>
  <div class="queue-page">
    <PageHeader title="Booking Queue" subtitle="Manage bookings awaiting verification and action">
      <template #actions>
        <el-button @click="store.resetFilters()">Reset Filters</el-button>
        <el-button type="primary" @click="store.fetchBookings()">Refresh</el-button>
      </template>
    </PageHeader>

    <!-- Filters -->
    <el-card shadow="never" class="queue-page__filters">
      <el-form inline>
        <el-form-item label="Status">
          <el-select
            v-model="store.filters.status"
            clearable
            placeholder="All statuses"
            style="width: 220px"
            @change="store.setFilters({ status: store.filters.status })"
          >
            <el-option
              v-for="opt in statusOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="From">
          <el-date-picker
            v-model="store.filters.dateFrom"
            type="date"
            placeholder="Start date"
            value-format="YYYY-MM-DD"
            @change="store.setFilters({ dateFrom: store.filters.dateFrom })"
          />
        </el-form-item>
        <el-form-item label="To">
          <el-date-picker
            v-model="store.filters.dateTo"
            type="date"
            placeholder="End date"
            value-format="YYYY-MM-DD"
            @change="store.setFilters({ dateTo: store.filters.dateTo })"
          />
        </el-form-item>
        <el-form-item label="Search">
          <el-input
            v-model="store.filters.q"
            clearable
            placeholder="Name or destination"
            style="width: 200px"
            @clear="store.setFilters({ q: undefined })"
            @keyup.enter="store.setFilters({ q: store.filters.q })"
          />
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Table -->
    <BookingTable
      :bookings="store.bookings"
      :loading="store.loading"
      :meta="store.meta"
      @page-change="store.setPage($event)"
      @size-change="store.setPageSize($event)"
      @verify="openVerifyDialog($event)"
    />

    <!-- Verify Dialog -->
    <VerifyDialog
      :visible="dialogVisible"
      :submitting="submitting"
      :notes="notes"
      :checklist="checklist"
      @update:visible="dialogVisible = $event"
      @update:notes="notes = $event"
      @update:checklist="checklist = $event"
      @confirm="confirm()"
      @reject="reject()"
    />
  </div>
</template>

<style scoped>
.queue-page__filters {
  margin-bottom: 16px;
}
</style>
