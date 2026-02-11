<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { StatusBadge } from '@/shared/ui';
import {
  formatDateTime,
  formatPrice,
  shortId,
  BookingStatus,
  BOOKING_STATUS_LABELS,
} from '@/shared/lib';
import { useBookingStore } from '@/entities/booking';
import type { BookingDetail } from '@/entities/booking';
import { NotesWidget } from '@/widgets/notes-widget';
import { VALID_BOOKING_TRANSITIONS } from './transitions';

const props = defineProps<{
  visible: boolean;
  bookingId: string | null;
}>();

const emit = defineEmits<{
  'update:visible': [val: boolean];
  statusChanged: [];
}>();

const router = useRouter();
const store = useBookingStore();

const booking = computed(() => store.currentBooking);
const loading = computed(() => store.detailLoading);

watch(
  () => props.bookingId,
  (id) => {
    if (id) store.fetchBookingById(id);
  },
  { immediate: true },
);

const nextStatuses = computed(() => {
  if (!booking.value) return [];
  const current = booking.value.status as BookingStatus;
  return (VALID_BOOKING_TRANSITIONS[current] ?? []).filter(
    (s) => s !== BookingStatus.CANCELLED,
  );
});

const canCancel = computed(() => {
  if (!booking.value) return false;
  const transitions = VALID_BOOKING_TRANSITIONS[booking.value.status as BookingStatus] ?? [];
  return transitions.includes(BookingStatus.CANCELLED);
});

const latestMeeting = computed(() => {
  if (!booking.value?.meetings.length) return null;
  return booking.value.meetings[booking.value.meetings.length - 1];
});

async function changeStatus(status: BookingStatus) {
  if (!booking.value) return;
  const res = await store.setBookingStatus(booking.value.id, { status });
  if (res.success) {
    ElMessage.success(`Status changed to ${BOOKING_STATUS_LABELS[status]}`);
    emit('statusChanged');
  } else {
    ElMessage.error(res.error ?? 'Failed to change status.');
  }
}

async function cancelBooking() {
  if (!booking.value) return;
  try {
    const result = await ElMessageBox.prompt(
      'Enter a reason for cancellation:',
      'Cancel Booking',
      { confirmButtonText: 'Cancel Booking', cancelButtonText: 'Back', type: 'warning' },
    );
    const reason = typeof result === 'string' ? result : (result as { value: string }).value;
    const res = await store.setBookingStatus(booking.value.id, {
      status: BookingStatus.CANCELLED,
      reason: reason || undefined,
    });
    if (res.success) {
      ElMessage.success('Booking cancelled.');
      emit('statusChanged');
    } else {
      ElMessage.error(res.error ?? 'Failed to cancel.');
    }
  } catch {
    // User dismissed prompt
  }
}

function goToDetail() {
  if (!booking.value) return;
  emit('update:visible', false);
  router.push({ name: 'booking-detail', params: { id: booking.value.id } });
}
</script>

<template>
  <el-drawer
    :model-value="visible"
    :size="640"
    :title="`Booking ${booking ? shortId(booking.id) : ''}`"
    direction="rtl"
    @update:model-value="emit('update:visible', $event)"
  >
    <div v-loading="loading">
      <template v-if="booking">
        <!-- Status -->
        <div class="drawer__status-row">
          <StatusBadge :status="booking.status" type="booking" />
          <el-button size="small" type="primary" link @click="goToDetail">
            Full Details
          </el-button>
        </div>

        <!-- Summary -->
        <el-descriptions :column="2" border class="drawer__section">
          <el-descriptions-item label="ID">{{ booking.id }}</el-descriptions-item>
          <el-descriptions-item label="Price">
            {{ formatPrice(booking.totalPrice, booking.currency) }}
          </el-descriptions-item>
          <el-descriptions-item label="Traveler">
            {{ booking.user.firstName }} {{ booking.user.lastName ?? '' }}
          </el-descriptions-item>
          <el-descriptions-item label="Agency">
            {{ booking.agency.name }}
          </el-descriptions-item>
          <el-descriptions-item label="Destination">
            {{ booking.offer.travelRequest.destination ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="Hotel">
            {{ booking.offer.hotelName ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="Departure">
            {{ formatDateTime(booking.offer.departureDate) }}
          </el-descriptions-item>
          <el-descriptions-item label="Return">
            {{ formatDateTime(booking.offer.returnDate) }}
          </el-descriptions-item>
          <el-descriptions-item label="Created">
            {{ formatDateTime(booking.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="Updated">
            {{ formatDateTime(booking.updatedAt) }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- Quick Actions -->
        <div v-if="nextStatuses.length || canCancel" class="drawer__section">
          <div class="drawer__section-title">Quick Actions</div>
          <div class="drawer__actions">
            <el-button
              v-for="s in nextStatuses"
              :key="s"
              size="small"
              type="primary"
              @click="changeStatus(s)"
            >
              {{ BOOKING_STATUS_LABELS[s] }}
            </el-button>
            <el-button
              v-if="canCancel"
              size="small"
              type="danger"
              @click="cancelBooking"
            >
              Cancel
            </el-button>
          </div>
        </div>

        <!-- Latest Meeting -->
        <div v-if="latestMeeting" class="drawer__section">
          <div class="drawer__section-title">Latest Meeting</div>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="Status">
              <StatusBadge :status="latestMeeting.status" type="meeting" />
            </el-descriptions-item>
            <el-descriptions-item label="Scheduled">
              {{ formatDateTime(latestMeeting.scheduledAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="Location">
              {{ latestMeeting.location ?? '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="Notes">
              {{ latestMeeting.notes ?? '—' }}
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- Notes -->
        <div class="drawer__section">
          <div class="drawer__section-title">Notes</div>
          <NotesWidget entity-type="BOOKING" :entity-id="booking.id" />
        </div>
      </template>
    </div>
  </el-drawer>
</template>

<style scoped>
.drawer__status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.drawer__section {
  margin-bottom: 20px;
}
.drawer__section-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
  color: #303133;
}
.drawer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
