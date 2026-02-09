export const PROXY_CHAT_QUEUE = 'proxy-chat';
export const PROXY_CHAT_CLEANUP_JOB = 'proxy-chat-cleanup';
export const INACTIVITY_DAYS = 7;

// ---------------------------------------------------------------------------
// Sticky chat session constants
// ---------------------------------------------------------------------------

/** Session inactivity timeout (30 minutes) */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/** Interval for periodic expired-session sweep (5 minutes) */
export const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Reply-keyboard button labels — exact strings Telegram sends back as text */
export const KB_EXIT_CHAT = '\u274c Exit chat';
export const KB_BOOKING_DETAILS = '\ud83d\udcc4 Booking details';
export const KB_CHAT_DETAILS = '\ud83d\udcc4 Chat details';
export const KB_CONTACT_MANAGER = '\ud83c\udd98 Contact manager';

/** Set of all keyboard labels for O(1) interception in the text handler */
export const CHAT_KEYBOARD_LABELS = new Set([
  KB_EXIT_CHAT,
  KB_BOOKING_DETAILS,
  KB_CHAT_DETAILS,
  KB_CONTACT_MANAGER,
]);
