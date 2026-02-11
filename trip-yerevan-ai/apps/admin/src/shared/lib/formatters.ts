import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return dayjs(date).format('DD MMM YYYY');
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return dayjs(date).format('DD MMM YYYY, HH:mm');
}

export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return dayjs(date).fromNow();
}

export function formatPrice(
  amount: string | number | null | undefined,
  currency = 'USD',
): string {
  if (amount == null) return '—';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
