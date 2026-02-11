<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { PageHeader, StatusBadge } from '@/shared/ui';
import { formatDateTime, formatPrice, shortId, BookingStatus } from '@/shared/lib';
import { useBookingStore } from '@/entities/booking';
import { MeetingTimeline } from '@/widgets/meeting-timeline';
import { useBookingVerify, VerifyDialog } from '@/features/booking-verify';
import {
  useMeetingActions,
  CounterProposeDialog,
  CompleteMeetingDialog,
} from '@/features/meeting-actions';
import { NotesWidget } from '@/widgets/notes-widget';

const route = useRoute();
const router = useRouter();
const store = useBookingStore();
const bookingId = route.params.id as string;

const verify = useBookingVerify();
const meeting = useMeetingActions();

const booking = computed(() => store.currentBooking);
const loading = computed(() => store.detailLoading);

const canVerify = computed(
  () => booking.value?.status === BookingStatus.AGENCY_CONFIRMED,
);

const isMeetingPhase = computed(() =>
  booking.value?.status === BookingStatus.MEETING_SCHEDULED ||
  booking.value?.status === BookingStatus.PAYMENT_PENDING,
);

const hasPendingProposal = computed(
  () => booking.value?.meetingProposals.some((p) => p.status === 'PENDING') ?? false,
);

const hasActiveMeeting = computed(
  () => booking.value?.meetings.some((m) => m.status === 'SCHEDULED' || m.status === 'CONFIRMED') ?? false,
);

onMounted(() => {
  store.fetchBookingById(bookingId);
});
</script>

<template>
  <div v-loading="loading" class="booking-detail">
    <template v-if="booking">
      <PageHeader
        :title="`Booking ${shortId(booking.id)}`"
        :subtitle="`${booking.offer.travelRequest.destination ?? 'Unknown'} — ${formatPrice(booking.totalPrice, booking.currency)}`"
      >
        <template #actions>
          <el-button @click="router.push({ name: 'queue' })">Back to Queue</el-button>
          <el-button
            v-if="canVerify"
            type="primary"
            @click="verify.openVerifyDialog(booking!.id)"
          >
            Verify Booking
          </el-button>
        </template>
      </PageHeader>

      <!-- Status + Key Info -->
      <el-row :gutter="16" class="booking-detail__cards">
        <el-col :span="16">
          <el-card shadow="never">
            <template #header>
              <div class="booking-detail__card-header">
                <span>Booking Information</span>
                <StatusBadge :status="booking.status" type="booking" />
              </div>
            </template>

            <el-descriptions :column="2" border>
              <el-descriptions-item label="Booking ID">{{ booking.id }}</el-descriptions-item>
              <el-descriptions-item label="Status">{{ booking.status }}</el-descriptions-item>
              <el-descriptions-item label="Total Price">
                {{ formatPrice(booking.totalPrice, booking.currency) }}
              </el-descriptions-item>
              <el-descriptions-item label="Created">
                {{ formatDateTime(booking.createdAt) }}
              </el-descriptions-item>
              <el-descriptions-item label="Manager Notes">
                {{ booking.managerNotes ?? '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="Cancel Reason">
                {{ booking.cancelReason ?? '—' }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>

        <el-col :span="8">
          <el-card shadow="never">
            <template #header>Traveler</template>
            <el-descriptions :column="1" border>
              <el-descriptions-item label="Name">
                {{ booking.user.firstName }} {{ booking.user.lastName ?? '' }}
              </el-descriptions-item>
              <el-descriptions-item label="Phone">
                {{ booking.user.phone ?? '—' }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>

          <el-card shadow="never" style="margin-top: 16px">
            <template #header>Agency</template>
            <el-descriptions :column="1" border>
              <el-descriptions-item label="Name">{{ booking.agency.name }}</el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>
      </el-row>

      <!-- Offer Details -->
      <el-card shadow="never" class="booking-detail__section">
        <template #header>Offer Details</template>
        <el-descriptions :column="2" border>
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
          <el-descriptions-item label="Nights">
            {{ booking.offer.nightsCount ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="Adults / Children">
            {{ booking.offer.adults ?? '—' }} / {{ booking.offer.travelRequest.children ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="Price">
            {{ formatPrice(booking.offer.totalPrice, booking.currency) }}
          </el-descriptions-item>
          <el-descriptions-item label="Description">
            {{ booking.offer.description ?? '—' }}
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- Meetings & Proposals -->
      <el-card shadow="never" class="booking-detail__section">
        <template #header>
          <div class="booking-detail__card-header">
            <span>Meetings & Proposals</span>
            <div v-if="isMeetingPhase" class="booking-detail__meeting-actions">
              <el-button
                v-if="hasPendingProposal"
                size="small"
                @click="meeting.confirmMeeting(booking!.id)"
              >
                Confirm
              </el-button>
              <el-button
                v-if="hasPendingProposal"
                size="small"
                type="warning"
                @click="meeting.openCounterDialog(booking!.id)"
              >
                Counter-Propose
              </el-button>
              <el-button
                v-if="hasActiveMeeting"
                size="small"
                type="success"
                @click="meeting.openCompleteDialog(booking!.id)"
              >
                Complete
              </el-button>
              <el-button
                v-if="hasActiveMeeting"
                size="small"
                type="danger"
                @click="meeting.cancelMeeting(booking!.id)"
              >
                Cancel
              </el-button>
            </div>
          </div>
        </template>

        <MeetingTimeline
          :meetings="booking.meetings"
          :proposals="booking.meetingProposals"
        />
      </el-card>

      <!-- Event History -->
      <el-card shadow="never" class="booking-detail__section">
        <template #header>Event History</template>
        <el-table :data="booking.events" stripe :border="true" style="width: 100%">
          <el-table-column label="From" width="200">
            <template #default="{ row }">
              <StatusBadge :status="row.fromStatus" type="booking" />
            </template>
          </el-table-column>
          <el-table-column label="To" width="200">
            <template #default="{ row }">
              <StatusBadge :status="row.toStatus" type="booking" />
            </template>
          </el-table-column>
          <el-table-column label="By" prop="triggeredBy" width="160">
            <template #default="{ row }">{{ row.triggeredBy ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="Reason" min-width="200">
            <template #default="{ row }">{{ row.reason ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="Date" width="180">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- Manager Notes -->
      <el-card shadow="never" class="booking-detail__section">
        <template #header>Notes</template>
        <NotesWidget entity-type="BOOKING" :entity-id="booking.id" />
      </el-card>
    </template>

    <!-- Dialogs -->
    <VerifyDialog
      :visible="verify.dialogVisible.value"
      :submitting="verify.submitting.value"
      :notes="verify.notes.value"
      :checklist="verify.checklist.value"
      @update:visible="verify.dialogVisible.value = $event"
      @update:notes="verify.notes.value = $event"
      @update:checklist="verify.checklist.value = $event"
      @confirm="verify.confirm()"
      @reject="verify.reject()"
    />

    <CounterProposeDialog
      :visible="meeting.counterDialogVisible.value"
      :loading="meeting.actionLoading.value"
      :form="meeting.counterForm.value"
      @update:visible="meeting.counterDialogVisible.value = $event"
      @update:form="meeting.counterForm.value = $event"
      @submit="meeting.submitCounterProposal()"
    />

    <CompleteMeetingDialog
      :visible="meeting.completeDialogVisible.value"
      :loading="meeting.actionLoading.value"
      :form="meeting.completeForm.value"
      @update:visible="meeting.completeDialogVisible.value = $event"
      @update:form="meeting.completeForm.value = $event"
      @submit="meeting.submitComplete()"
    />
  </div>
</template>

<style scoped>
.booking-detail__cards {
  margin-bottom: 16px;
}
.booking-detail__section {
  margin-bottom: 16px;
}
.booking-detail__card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.booking-detail__meeting-actions {
  display: flex;
  gap: 4px;
}
</style>
