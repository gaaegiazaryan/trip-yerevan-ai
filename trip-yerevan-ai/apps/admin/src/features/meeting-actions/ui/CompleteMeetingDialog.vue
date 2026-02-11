<script setup lang="ts">
import type { CompleteMeetingPayload } from '@/entities/meeting';

defineProps<{
  visible: boolean;
  loading: boolean;
  form: CompleteMeetingPayload;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:form': [value: CompleteMeetingPayload];
  submit: [];
}>();

const paymentMethods = ['CASH', 'CARD', 'TRANSFER', 'OTHER'];
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="Complete Meeting"
    width="480px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form label-position="top">
      <el-form-item label="Payment Amount">
        <el-input-number
          :model-value="form.amount"
          :min="0"
          :precision="2"
          placeholder="0.00"
          style="width: 100%"
          @update:model-value="emit('update:form', { ...form, amount: $event ?? undefined })"
        />
      </el-form-item>
      <el-form-item label="Payment Method">
        <el-select
          :model-value="form.paymentMethod"
          style="width: 100%"
          @update:model-value="emit('update:form', { ...form, paymentMethod: $event as string })"
        >
          <el-option
            v-for="method in paymentMethods"
            :key="method"
            :label="method"
            :value="method"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="Notes">
        <el-input
          type="textarea"
          :rows="2"
          :model-value="form.notes"
          placeholder="Meeting summary or notes"
          @update:model-value="emit('update:form', { ...form, notes: ($event as string) })"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:visible', false)">Cancel</el-button>
      <el-button type="success" :loading="loading" @click="emit('submit')">
        Mark Complete
      </el-button>
    </template>
  </el-dialog>
</template>
