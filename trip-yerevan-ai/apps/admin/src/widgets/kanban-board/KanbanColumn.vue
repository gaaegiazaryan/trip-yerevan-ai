<script setup lang="ts">
import type { BookingListItem } from '@/entities/booking';
import { formatPrice, shortId } from '@/shared/lib';

defineProps<{
  status: string;
  label: string;
  color: string;
  bookings: BookingListItem[];
}>();

const emit = defineEmits<{
  cardClick: [bookingId: string];
}>();

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
</script>

<template>
  <div class="kanban-column">
    <div class="kanban-column__header" :style="{ borderTopColor: color }">
      <span class="kanban-column__title">{{ label }}</span>
      <el-badge :value="bookings.length" :type="bookings.length ? 'primary' : 'info'" />
    </div>

    <div class="kanban-column__body">
      <div
        v-for="b in bookings"
        :key="b.id"
        class="kanban-card"
        @click="emit('cardClick', b.id)"
      >
        <div class="kanban-card__dest">
          {{ b.offer.destination ?? 'Unknown' }}
        </div>
        <div class="kanban-card__meta">
          <span>{{ b.user.firstName }} {{ b.user.lastName ?? '' }}</span>
          <span class="kanban-card__price">{{ formatPrice(b.totalPrice, b.currency) }}</span>
        </div>
        <div class="kanban-card__footer">
          <span class="kanban-card__agency">{{ b.agency.name }}</span>
          <span class="kanban-card__date">{{ formatDate(b.offer.departureDate) }}</span>
        </div>
        <div class="kanban-card__id">{{ shortId(b.id) }}</div>
      </div>

      <div v-if="!bookings.length" class="kanban-column__empty">
        No bookings
      </div>
    </div>
  </div>
</template>

<style scoped>
.kanban-column {
  min-width: 220px;
  max-width: 260px;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
  border-radius: 8px;
  overflow: hidden;
}
.kanban-column__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #fff;
  border-top: 3px solid #409eff;
  font-weight: 600;
  font-size: 13px;
}
.kanban-column__title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kanban-column__body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100vh - 240px);
}
.kanban-column__empty {
  padding: 24px 0;
  text-align: center;
  color: #909399;
  font-size: 12px;
}

.kanban-card {
  background: #fff;
  border-radius: 6px;
  padding: 10px 12px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.15s, transform 0.15s;
}
.kanban-card:hover {
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}
.kanban-card__dest {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 6px;
  color: #303133;
}
.kanban-card__meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #606266;
  margin-bottom: 4px;
}
.kanban-card__price {
  font-weight: 600;
  color: #409eff;
}
.kanban-card__footer {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #909399;
}
.kanban-card__agency {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}
.kanban-card__id {
  font-size: 10px;
  color: #c0c4cc;
  margin-top: 4px;
}
</style>
