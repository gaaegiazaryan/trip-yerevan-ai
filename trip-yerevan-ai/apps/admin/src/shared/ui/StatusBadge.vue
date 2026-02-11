<script setup lang="ts">
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_COLORS,
  AGENCY_STATUS_LABELS,
  AGENCY_STATUS_COLORS,
  MEETING_STATUS_COLORS,
  PROPOSAL_STATUS_COLORS,
  type BookingStatus,
  type AgencyStatus,
  type MeetingStatus,
  type MeetingProposalStatus,
} from '@/shared/lib';

type StatusType = 'booking' | 'agency' | 'meeting' | 'proposal';

const props = defineProps<{
  status: string;
  type?: StatusType;
}>();

const colorMap: Record<StatusType, Record<string, string>> = {
  booking: BOOKING_STATUS_COLORS,
  agency: AGENCY_STATUS_COLORS,
  meeting: MEETING_STATUS_COLORS,
  proposal: PROPOSAL_STATUS_COLORS,
};

const labelMap: Record<string, Record<string, string>> = {
  booking: BOOKING_STATUS_LABELS,
  agency: AGENCY_STATUS_LABELS,
};

const color = computed(() => {
  const map = colorMap[props.type ?? 'booking'];
  return (map as Record<string, string>)[props.status] ?? 'info';
});

const label = computed(() => {
  const map = labelMap[props.type ?? 'booking'];
  if (map) {
    return map[props.status] ?? props.status;
  }
  return props.status.replace(/_/g, ' ');
});
</script>

<script lang="ts">
import { computed } from 'vue';
</script>

<template>
  <el-tag :type="(color as any)" size="small" effect="light" round>
    {{ label }}
  </el-tag>
</template>
