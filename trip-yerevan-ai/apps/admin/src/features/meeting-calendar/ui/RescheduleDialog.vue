<script setup lang="ts">
import type { ReschedulePayload } from '@/entities/meeting';

defineProps<{
  visible: boolean;
  loading: boolean;
  form: ReschedulePayload;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:form': [value: ReschedulePayload];
  submit: [];
}>();
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="Reschedule Meeting"
    width="480px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form label-position="top">
      <el-form-item label="New Date & Time" required>
        <el-date-picker
          :model-value="form.dateTime"
          type="datetime"
          placeholder="Select new date and time"
          style="width: 100%"
          @update:model-value="emit('update:form', { ...form, dateTime: ($event as Date)?.toISOString() ?? '' })"
        />
      </el-form-item>
      <el-form-item label="Location">
        <el-input
          :model-value="form.location"
          placeholder="e.g., Office, Zoom, Cafe"
          @update:model-value="emit('update:form', { ...form, location: ($event as string) })"
        />
      </el-form-item>
      <el-form-item label="Notes">
        <el-input
          type="textarea"
          :rows="2"
          :model-value="form.notes"
          placeholder="Optional notes"
          @update:model-value="emit('update:form', { ...form, notes: ($event as string) })"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:visible', false)">Cancel</el-button>
      <el-button
        type="primary"
        :loading="loading"
        :disabled="!form.dateTime"
        @click="emit('submit')"
      >
        Reschedule
      </el-button>
    </template>
  </el-dialog>
</template>
