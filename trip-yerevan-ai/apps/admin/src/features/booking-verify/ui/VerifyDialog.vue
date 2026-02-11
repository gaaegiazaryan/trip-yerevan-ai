<script setup lang="ts">
defineProps<{
  visible: boolean;
  submitting: boolean;
  notes: string;
  checklist: Record<string, boolean>;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:notes': [value: string];
  'update:checklist': [value: Record<string, boolean>];
  confirm: [];
  reject: [];
}>();

const checklistLabels: Record<string, string> = {
  priceConfirmed: 'Price verified',
  datesConfirmed: 'Dates verified',
  hotelConfirmed: 'Hotel verified',
  flightConfirmed: 'Flight verified',
};

function toggleCheck(key: string, val: boolean) {
  emit('update:checklist', { ...arguments[2] ?? {}, [key]: val });
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="Verify Booking"
    width="520px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="verify-dialog">
      <h4 style="margin: 0 0 12px">Verification Checklist</h4>
      <div v-for="(label, key) in checklistLabels" :key="key" class="verify-dialog__check">
        <el-checkbox
          :model-value="checklist[key]"
          @update:model-value="emit('update:checklist', { ...checklist, [key]: !!$event })"
        >
          {{ label }}
        </el-checkbox>
      </div>

      <el-divider />

      <el-input
        type="textarea"
        :rows="3"
        :model-value="notes"
        placeholder="Manager notes (optional)"
        @update:model-value="emit('update:notes', $event as string)"
      />
    </div>

    <template #footer>
      <el-button @click="emit('update:visible', false)">Cancel</el-button>
      <el-button type="danger" :loading="submitting" @click="emit('reject')">
        Reject
      </el-button>
      <el-button type="primary" :loading="submitting" @click="emit('confirm')">
        Confirm & Verify
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.verify-dialog__check {
  margin-bottom: 8px;
}
</style>
