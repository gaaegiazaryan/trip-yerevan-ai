<script setup lang="ts">
import { ref } from 'vue';
import FullCalendar from '@fullcalendar/vue3';
import type { EventClickArg, DatesSetArg } from '@fullcalendar/core';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { PageHeader } from '@/shared/ui';
import { useCalendarStore, type CalendarEvent, type ReschedulePayload } from '@/entities/meeting';
import {
  useCalendarConfig,
  MeetingDetailModal,
  RescheduleDialog,
} from '@/features/meeting-calendar';

const router = useRouter();
const calendarStore = useCalendarStore();

const selectedEvent = ref<CalendarEvent | null>(null);
const detailVisible = ref(false);

const rescheduleVisible = ref(false);
const rescheduleLoading = ref(false);
const rescheduleForm = ref<ReschedulePayload>({ dateTime: '' });

function onEventClick(arg: EventClickArg) {
  const evt = calendarStore.events.find((e) => e.id === arg.event.id);
  if (evt) {
    selectedEvent.value = evt;
    detailVisible.value = true;
  }
}

function onDatesSet(arg: DatesSetArg) {
  calendarStore.fetchEvents({
    from: arg.startStr,
    to: arg.endStr,
  });
}

const { calendarOptions } = useCalendarConfig({
  onEventClick,
  onDatesSet,
});

function openReschedule() {
  if (!selectedEvent.value) return;
  rescheduleForm.value = {
    dateTime: selectedEvent.value.start,
    location: selectedEvent.value.extendedProps.location ?? undefined,
  };
  detailVisible.value = false;
  rescheduleVisible.value = true;
}

async function submitReschedule() {
  if (!selectedEvent.value) return;
  rescheduleLoading.value = true;
  try {
    const res = await calendarStore.rescheduleMeeting(
      selectedEvent.value.extendedProps.bookingId,
      {
        ...rescheduleForm.value,
        dateTime: new Date(rescheduleForm.value.dateTime).toISOString(),
      },
    );
    if (res.success) {
      ElMessage.success('Meeting rescheduled.');
      rescheduleVisible.value = false;
    } else {
      ElMessage.error(res.error ?? 'Failed to reschedule.');
    }
  } catch {
    ElMessage.error('Failed to reschedule meeting.');
  } finally {
    rescheduleLoading.value = false;
  }
}

function navigateToBooking(bookingId: string) {
  detailVisible.value = false;
  router.push({ name: 'booking-detail', params: { id: bookingId } });
}

function refresh() {
  if (calendarStore.currentRange) {
    calendarStore.fetchEvents(calendarStore.currentRange);
  }
}
</script>

<template>
  <div class="calendar-page">
    <PageHeader title="Meeting Calendar" subtitle="View and manage scheduled meetings">
      <template #actions>
        <el-button type="primary" @click="refresh">Refresh</el-button>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <FullCalendar :options="{ ...calendarOptions, events: calendarStore.events }" />
    </el-card>

    <MeetingDetailModal
      :visible="detailVisible"
      :event="selectedEvent"
      @update:visible="detailVisible = $event"
      @reschedule="openReschedule()"
      @navigate-to-booking="navigateToBooking"
    />

    <RescheduleDialog
      :visible="rescheduleVisible"
      :loading="rescheduleLoading"
      :form="rescheduleForm"
      @update:visible="rescheduleVisible = $event"
      @update:form="rescheduleForm = $event"
      @submit="submitReschedule()"
    />
  </div>
</template>
