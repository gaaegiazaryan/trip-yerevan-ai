export const NOTIFICATION_QUEUE = 'notification-delivery';
export const NOTIFICATION_DELIVERY_JOB = 'deliver';

export const MAX_DELIVERY_ATTEMPTS = 5;

/** Max concurrent notification jobs processed by the worker. */
export const NOTIFICATION_CONCURRENCY = 5;

/**
 * Backoff delays per attempt (in seconds).
 * attempt 1: 30s, attempt 2: 2m, attempt 3: 10m, attempt 4: 30m, attempt 5: 2h
 */
export const BACKOFF_DELAYS_SEC = [30, 120, 600, 1800, 7200];
