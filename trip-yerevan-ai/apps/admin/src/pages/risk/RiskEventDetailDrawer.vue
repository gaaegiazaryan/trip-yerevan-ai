<script setup lang="ts">
import { formatDateTime } from '@/shared/lib';
import {
  RISK_SEVERITY_LABELS,
  RISK_SEVERITY_COLORS,
  RISK_ENTITY_TYPE_LABELS,
} from '@/shared/lib';
import type { RiskEvent } from '@/entities/risk';

defineProps<{
  event: RiskEvent | null;
  visible: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

function formatPayload(payload: Record<string, unknown> | null): string {
  if (!payload) return '—';
  return JSON.stringify(payload, null, 2);
}
</script>

<template>
  <el-drawer
    :model-value="visible"
    title="Risk Event Details"
    size="560px"
    @update:model-value="emit('update:visible', $event)"
  >
    <div v-if="event" v-loading="loading" class="risk-drawer">
      <!-- Severity badge -->
      <div class="risk-drawer__header">
        <el-tag
          :type="RISK_SEVERITY_COLORS[event.severity] as any"
          size="large"
          effect="dark"
        >
          {{ RISK_SEVERITY_LABELS[event.severity] ?? event.severity }}
        </el-tag>
        <span class="risk-drawer__time">{{ formatDateTime(event.createdAt) }}</span>
      </div>

      <!-- Summary -->
      <el-descriptions :column="1" border class="risk-drawer__section">
        <el-descriptions-item label="ID">{{ event.id }}</el-descriptions-item>
        <el-descriptions-item label="Severity">
          {{ RISK_SEVERITY_LABELS[event.severity] ?? event.severity }}
        </el-descriptions-item>
        <el-descriptions-item label="Entity Type">
          {{ RISK_ENTITY_TYPE_LABELS[event.entityType] ?? event.entityType }}
        </el-descriptions-item>
        <el-descriptions-item label="Entity ID">
          {{ event.entityId }}
        </el-descriptions-item>
        <el-descriptions-item label="Created">
          {{ formatDateTime(event.createdAt) }}
        </el-descriptions-item>
      </el-descriptions>

      <!-- Reason -->
      <div class="risk-drawer__section">
        <div class="risk-drawer__label">Reason</div>
        <div class="risk-drawer__reason">{{ event.reason }}</div>
      </div>

      <!-- Payload -->
      <div class="risk-drawer__section">
        <div class="risk-drawer__label">Payload</div>
        <pre class="risk-drawer__payload">{{ formatPayload(event.payload) }}</pre>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.risk-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.risk-drawer__time {
  font-size: 13px;
  color: #909399;
}
.risk-drawer__section {
  margin-bottom: 20px;
}
.risk-drawer__label {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
  margin-bottom: 8px;
}
.risk-drawer__reason {
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 4px;
  padding: 12px;
  font-size: 13px;
  color: #f56c6c;
}
.risk-drawer__payload {
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 12px;
  font-size: 12px;
  overflow-x: auto;
  max-height: 300px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
