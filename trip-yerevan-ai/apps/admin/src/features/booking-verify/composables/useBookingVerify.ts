import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useBookingStore } from '@/entities/booking';

export function useBookingVerify() {
  const store = useBookingStore();
  const dialogVisible = ref(false);
  const submitting = ref(false);
  const targetBookingId = ref<string | null>(null);

  const notes = ref('');
  const checklist = ref<Record<string, boolean>>({
    priceConfirmed: false,
    datesConfirmed: false,
    hotelConfirmed: false,
    flightConfirmed: false,
  });

  function openVerifyDialog(bookingId: string) {
    targetBookingId.value = bookingId;
    notes.value = '';
    checklist.value = {
      priceConfirmed: false,
      datesConfirmed: false,
      hotelConfirmed: false,
      flightConfirmed: false,
    };
    dialogVisible.value = true;
  }

  function closeDialog() {
    dialogVisible.value = false;
    targetBookingId.value = null;
  }

  async function confirm() {
    if (!targetBookingId.value) return;
    submitting.value = true;
    try {
      const res = await store.verifyBooking(targetBookingId.value, {
        action: 'CONFIRM',
        notes: notes.value || undefined,
        checklist: checklist.value,
      });
      if (res.success) {
        ElMessage.success('Booking verified successfully.');
        closeDialog();
      } else {
        ElMessage.error(res.error ?? 'Verification failed.');
      }
    } catch {
      ElMessage.error('Verification failed.');
    } finally {
      submitting.value = false;
    }
  }

  async function reject() {
    if (!targetBookingId.value) return;
    submitting.value = true;
    try {
      const res = await store.verifyBooking(targetBookingId.value, {
        action: 'REJECT',
        notes: notes.value || undefined,
      });
      if (res.success) {
        ElMessage.success('Booking rejected.');
        closeDialog();
      } else {
        ElMessage.error(res.error ?? 'Rejection failed.');
      }
    } catch {
      ElMessage.error('Rejection failed.');
    } finally {
      submitting.value = false;
    }
  }

  return {
    dialogVisible,
    submitting,
    targetBookingId,
    notes,
    checklist,
    openVerifyDialog,
    closeDialog,
    confirm,
    reject,
  };
}
