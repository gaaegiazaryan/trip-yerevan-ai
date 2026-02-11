<script setup lang="ts">
import { computed } from 'vue';
import { StatusBadge } from '@/shared/ui';
import { formatDateTime } from '@/shared/lib';
import type { CalendarEvent } from '@/entities/meeting';
import { NotesWidget } from '@/widgets/notes-widget';

const props = defineProps<{
  visible: boolean;
  event: CalendarEvent | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  reschedule: [];
  'navigate-to-booking': [bookingId: string];
}>();

const ext = computed(() => props.event?.extendedProps ?? null);

const canReschedule = computed(
  () => ext.value?.status === 'SCHEDULED' || ext.value?.status === 'CONFIRMED',
);
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="Meeting Details"
    width="520px"
    @update:model-value="emit('update:visible', $event)"
  >
    <template v-if="event && ext">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="Status">
          <StatusBadge :status="ext.status" type="meeting" />
        </el-descriptions-item>
        <el-descriptions-item label="Date & Time">
          {{ formatDateTime(event.start) }} — {{ formatDateTime(event.end) }}
        </el-descriptions-item>
        <el-descriptions-item label="Traveler">
          {{ ext.userName }}
        </el-descriptions-item>
        <el-descriptions-item label="Agency">
          {{ ext.agencyName }}
        </el-descriptions-item>
        <el-descriptions-item label="Destination">
          {{ ext.destination ?? '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="Location">
          {{ ext.location ?? '—' }}
        </el-descriptions-item>
        <el-descriptions-item v-if="ext.notes" label="Notes">
          {{ ext.notes }}
        </el-descriptions-item>
      </el-descriptions>

      <div style="margin-top: 16px">
        <h4 style="margin: 0 0 8px; font-size: 14px; color: #606266">Notes</h4>
        <NotesWidget entity-type="MEETING" :entity-id="ext.meetingId" />
      </div>
    </template>

    <template #footer>
      <el-button @click="emit('update:visible', false)">Close</el-button>
      <el-button
        v-if="ext"
        type="info"
        @click="emit('navigate-to-booking', ext!.bookingId)"
      >
        View Booking
      </el-button>
      <el-button
        v-if="canReschedule"
        type="warning"
        @click="emit('reschedule')"
      >
        Reschedule
      </el-button>
    </template>
  </el-dialog>
</template>
