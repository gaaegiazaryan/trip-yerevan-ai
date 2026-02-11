import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useMeetingStore } from '@/entities/meeting';
import type {
  CounterProposePayload,
  CompleteMeetingPayload,
  CancelMeetingPayload,
} from '@/entities/meeting';

export function useMeetingActions() {
  const store = useMeetingStore();
  const actionLoading = ref(false);

  // Counter-propose dialog state
  const counterDialogVisible = ref(false);
  const counterTarget = ref<string | null>(null);
  const counterForm = ref<CounterProposePayload>({
    dateTime: '',
    location: '',
    notes: '',
  });

  // Complete dialog state
  const completeDialogVisible = ref(false);
  const completeTarget = ref<string | null>(null);
  const completeForm = ref<CompleteMeetingPayload>({
    notes: '',
    amount: undefined,
    paymentMethod: 'CASH',
  });

  async function confirmMeeting(bookingId: string) {
    try {
      await ElMessageBox.confirm(
        'Confirm this meeting schedule?',
        'Confirm Meeting',
        { confirmButtonText: 'Confirm', cancelButtonText: 'Cancel', type: 'info' },
      );
    } catch {
      return; // user cancelled
    }

    actionLoading.value = true;
    try {
      const res = await store.confirmMeeting(bookingId);
      if (res.success) {
        ElMessage.success('Meeting confirmed.');
      } else {
        ElMessage.error(res.error ?? 'Failed to confirm meeting.');
      }
    } catch {
      ElMessage.error('Failed to confirm meeting.');
    } finally {
      actionLoading.value = false;
    }
  }

  function openCounterDialog(bookingId: string) {
    counterTarget.value = bookingId;
    counterForm.value = { dateTime: '', location: '', notes: '' };
    counterDialogVisible.value = true;
  }

  async function submitCounterProposal() {
    if (!counterTarget.value || !counterForm.value.dateTime) return;
    actionLoading.value = true;
    try {
      const payload: CounterProposePayload = {
        dateTime: new Date(counterForm.value.dateTime).toISOString(),
        location: counterForm.value.location || undefined,
        notes: counterForm.value.notes || undefined,
      };
      const res = await store.counterPropose(counterTarget.value, payload);
      if (res.success) {
        ElMessage.success('Counter-proposal submitted.');
        counterDialogVisible.value = false;
      } else {
        ElMessage.error(res.error ?? 'Failed to submit counter-proposal.');
      }
    } catch {
      ElMessage.error('Failed to submit counter-proposal.');
    } finally {
      actionLoading.value = false;
    }
  }

  function openCompleteDialog(bookingId: string) {
    completeTarget.value = bookingId;
    completeForm.value = { notes: '', amount: undefined, paymentMethod: 'CASH' };
    completeDialogVisible.value = true;
  }

  async function submitComplete() {
    if (!completeTarget.value) return;
    actionLoading.value = true;
    try {
      const res = await store.completeMeeting(completeTarget.value, completeForm.value);
      if (res.success) {
        ElMessage.success('Meeting completed.');
        completeDialogVisible.value = false;
      } else {
        ElMessage.error(res.error ?? 'Failed to complete meeting.');
      }
    } catch {
      ElMessage.error('Failed to complete meeting.');
    } finally {
      actionLoading.value = false;
    }
  }

  async function cancelMeeting(bookingId: string) {
    let reason = '';
    try {
      const result = await ElMessageBox.prompt(
        'Provide a reason for cancellation (optional):',
        'Cancel Meeting',
        { confirmButtonText: 'Cancel Meeting', cancelButtonText: 'Back', type: 'warning', inputType: 'textarea' },
      );
      reason = (result as { value: string }).value;
    } catch {
      return; // user cancelled
    }

    actionLoading.value = true;
    try {
      const payload: CancelMeetingPayload = { reason: reason || undefined };
      const res = await store.cancelMeeting(bookingId, payload);
      if (res.success) {
        ElMessage.success('Meeting cancelled.');
      } else {
        ElMessage.error(res.error ?? 'Failed to cancel meeting.');
      }
    } catch {
      ElMessage.error('Failed to cancel meeting.');
    } finally {
      actionLoading.value = false;
    }
  }

  return {
    actionLoading,
    // Confirm
    confirmMeeting,
    // Counter-propose
    counterDialogVisible,
    counterTarget,
    counterForm,
    openCounterDialog,
    submitCounterProposal,
    // Complete
    completeDialogVisible,
    completeTarget,
    completeForm,
    openCompleteDialog,
    submitComplete,
    // Cancel
    cancelMeeting,
  };
}
