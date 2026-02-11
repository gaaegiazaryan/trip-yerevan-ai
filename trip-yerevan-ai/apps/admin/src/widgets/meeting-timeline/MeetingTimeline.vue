<script setup lang="ts">
import { StatusBadge } from '@/shared/ui';
import { formatDateTime, formatRelative } from '@/shared/lib';
import type { BookingMeeting, BookingProposal } from '@/entities/booking';

defineProps<{
  meetings: BookingMeeting[];
  proposals: BookingProposal[];
}>();

type TimelineEntry = {
  id: string;
  type: 'meeting' | 'proposal';
  status: string;
  statusType: 'meeting' | 'proposal';
  date: string;
  location: string | null;
  notes: string | null;
  extra?: string;
  createdAt: string;
};

function buildTimeline(meetings: BookingMeeting[], proposals: BookingProposal[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const m of meetings) {
    entries.push({
      id: m.id,
      type: 'meeting',
      status: m.status,
      statusType: 'meeting',
      date: m.scheduledAt,
      location: m.location,
      notes: m.notes,
      createdAt: m.createdAt,
    });
  }

  for (const p of proposals) {
    entries.push({
      id: p.id,
      type: 'proposal',
      status: p.status,
      statusType: 'proposal',
      date: p.proposedDate,
      location: p.proposedLocation,
      notes: p.notes,
      extra: `by ${p.proposerRole}`,
      createdAt: p.createdAt,
    });
  }

  entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return entries;
}
</script>

<template>
  <div class="meeting-timeline">
    <el-timeline>
      <el-timeline-item
        v-for="entry in buildTimeline(meetings, proposals)"
        :key="entry.id"
        :timestamp="formatRelative(entry.createdAt)"
        placement="top"
      >
        <el-card shadow="never" body-style="padding: 12px 16px">
          <div class="meeting-timeline__header">
            <span class="meeting-timeline__type">
              {{ entry.type === 'meeting' ? 'Meeting' : 'Proposal' }}
            </span>
            <StatusBadge :status="entry.status" :type="entry.statusType" />
            <span v-if="entry.extra" class="meeting-timeline__extra">{{ entry.extra }}</span>
          </div>
          <div class="meeting-timeline__body">
            <div><strong>Date:</strong> {{ formatDateTime(entry.date) }}</div>
            <div v-if="entry.location"><strong>Location:</strong> {{ entry.location }}</div>
            <div v-if="entry.notes"><strong>Notes:</strong> {{ entry.notes }}</div>
          </div>
        </el-card>
      </el-timeline-item>
    </el-timeline>

    <el-empty
      v-if="meetings.length === 0 && proposals.length === 0"
      description="No meetings or proposals yet"
    />
  </div>
</template>

<style scoped>
.meeting-timeline__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.meeting-timeline__type {
  font-weight: 600;
  font-size: 14px;
}
.meeting-timeline__extra {
  color: #909399;
  font-size: 12px;
}
.meeting-timeline__body {
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
}
</style>
